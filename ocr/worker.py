#!/usr/bin/env python3
"""Single-concurrency OCR queue worker for the transfer assistant."""

from __future__ import annotations

import gc
import logging
import os
import signal
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from rapidocr import RapidOCR


def env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    return default if value is None else value.strip().lower() in {"1", "true", "yes", "on"}


DATA_DIR = Path(os.getenv("DATA_DIR", "/data")).resolve()
DB_PATH = Path(os.getenv("DB_PATH", str(DATA_DIR / "transfer.db"))).resolve()
FILES_DIR = Path(os.getenv("FILES_DIR", os.getenv("UPLOAD_DIR", str(DATA_DIR / "files")))).resolve()
POLL_SECONDS = max(1.0, float(os.getenv("OCR_POLL_SECONDS", "3")))
MAX_EDGE = max(640, int(os.getenv("OCR_MAX_EDGE", "2200")))
DET_LIMIT_SIDE = max(640, min(MAX_EDGE, int(os.getenv("OCR_DET_LIMIT_SIDE", "1280"))))
MAX_IMAGE_PIXELS = max(1_000_000, int(os.getenv("OCR_MAX_IMAGE_PIXELS", "40000000")))
MIN_SCORE = min(1.0, max(0.0, float(os.getenv("OCR_MIN_SCORE", "0.45"))))
MAX_ATTEMPTS = max(1, int(os.getenv("OCR_MAX_ATTEMPTS", "3")))
STALE_MS = max(60, int(os.getenv("OCR_STALE_AFTER_SECONDS", "900"))) * 1000
RELEASE_MODEL_AFTER = max(0, int(os.getenv("OCR_RELEASE_MODEL_AFTER_SECONDS", "300")))
LOG_LEVEL = os.getenv("OCR_LOG_LEVEL", "INFO").upper()

Image.MAX_IMAGE_PIXELS = MAX_IMAGE_PIXELS
logging.basicConfig(level=LOG_LEVEL, format="%(asctime)s %(levelname)s ocr-worker %(message)s")
LOG = logging.getLogger("ocr-worker")
STOP = False


def stop_handler(_signum: int, _frame: Any) -> None:
    global STOP
    STOP = True


signal.signal(signal.SIGTERM, stop_handler)
signal.signal(signal.SIGINT, stop_handler)


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout=10000")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def global_ocr_enabled(conn: sqlite3.Connection) -> bool:
    if not env_bool("OCR_ENABLED", True):
        return False
    try:
        row = conn.execute("SELECT value FROM settings WHERE key='ocr_enabled'").fetchone()
    except sqlite3.OperationalError:
        return False
    if row is None:
        return True
    return str(row["value"]).strip().lower() in {"1", "true", "yes", "on"}


def recover_stale_jobs(conn: sqlite3.Connection) -> None:
    cutoff = int(time.time() * 1000) - STALE_MS
    try:
        conn.execute(
            "UPDATE ocr_jobs SET status='pending', error='worker interrupted', updated_at=? "
            "WHERE status='processing' AND updated_at<? AND attempts<?",
            (int(time.time() * 1000), cutoff, MAX_ATTEMPTS),
        )
        conn.execute(
            "UPDATE ocr_jobs SET status='failed', error='maximum attempts reached', updated_at=? "
            "WHERE status='processing' AND updated_at<? AND attempts>=?",
            (int(time.time() * 1000), cutoff, MAX_ATTEMPTS),
        )
    except sqlite3.OperationalError:
        pass


def claim_job(conn: sqlite3.Connection) -> sqlite3.Row | None:
    now = int(time.time() * 1000)
    try:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            """
            SELECT j.id, j.message_id, j.attempts, b.path, b.mime
            FROM ocr_jobs j
            JOIN messages m ON m.id=j.message_id
            JOIN blobs b ON b.id=m.blob_id
            WHERE j.status='pending' AND j.attempts<? AND m.deleted_at IS NULL
              AND m.type='file' AND b.mime LIKE 'image/%'
            ORDER BY j.created_at ASC
            LIMIT 1
            """,
            (MAX_ATTEMPTS,),
        ).fetchone()
        if row is None:
            conn.execute("COMMIT")
            return None
        changed = conn.execute(
            "UPDATE ocr_jobs SET status='processing', attempts=attempts+1, error=NULL, updated_at=? "
            "WHERE id=? AND status='pending'",
            (now, row["id"]),
        ).rowcount
        conn.execute("COMMIT")
        return row if changed == 1 else None
    except sqlite3.OperationalError:
        if conn.in_transaction:
            conn.execute("ROLLBACK")
        return None


def safe_image_path(stored_path: str) -> Path:
    raw = Path(stored_path)
    candidates = [raw] if raw.is_absolute() else [FILES_DIR / raw, DATA_DIR / raw]
    for candidate in candidates:
        resolved = candidate.resolve()
        try:
            resolved.relative_to(FILES_DIR)
        except ValueError:
            continue
        if resolved.is_file():
            return resolved
    raise FileNotFoundError("blob file is missing or outside FILES_DIR")


def load_image(path: Path) -> np.ndarray:
    with Image.open(path) as source:
        source.draft("RGB", (MAX_EDGE, MAX_EDGE))
        image = ImageOps.exif_transpose(source)
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        if image.mode in {"RGBA", "LA"} or (image.mode == "P" and "transparency" in image.info):
            rgba = image.convert("RGBA")
            background = Image.new("RGBA", rgba.size, "white")
            image = Image.alpha_composite(background, rgba).convert("RGB")
        else:
            image = image.convert("RGB")
        return np.asarray(image)


def recognize(engine: RapidOCR, path: Path) -> str:
    result = engine(load_image(path))
    texts = tuple(getattr(result, "txts", ()) or ())
    scores = tuple(getattr(result, "scores", ()) or ())
    selected = [text.strip() for text, score in zip(texts, scores) if text.strip() and float(score) >= MIN_SCORE]
    return "\n".join(selected)


def complete_job(conn: sqlite3.Connection, job: sqlite3.Row, text: str) -> None:
    now = int(time.time() * 1000)
    conn.execute("BEGIN IMMEDIATE")
    try:
        conn.execute(
            "UPDATE messages SET ocr_text=?, ocr_status='done', updated_at=? WHERE id=? AND deleted_at IS NULL",
            (text, now, job["message_id"]),
        )
        conn.execute("DELETE FROM messages_fts WHERE message_id=?", (job["message_id"],))
        message = conn.execute(
            "SELECT id,content,file_name,ocr_text,note,tags FROM messages WHERE id=? AND deleted_at IS NULL",
            (job["message_id"],),
        ).fetchone()
        if message is not None:
            conn.execute(
                "INSERT INTO messages_fts(message_id,content,file_name,ocr_text,note,tags) VALUES(?,?,?,?,?,?)",
                (
                    message["id"], message["content"] or "", message["file_name"] or "",
                    message["ocr_text"] or "", message["note"] or "", message["tags"] or "",
                ),
            )
        conn.execute("UPDATE ocr_jobs SET status='done', error=NULL, updated_at=? WHERE id=?", (now, job["id"]))
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise


def fail_job(conn: sqlite3.Connection, job: sqlite3.Row, error: Exception) -> None:
    now = int(time.time() * 1000)
    attempts = int(job["attempts"]) + 1
    status = "failed" if attempts >= MAX_ATTEMPTS else "pending"
    safe_error = f"{type(error).__name__}: {error}"[:500]
    conn.execute(
        "UPDATE ocr_jobs SET status=?, error=?, updated_at=? WHERE id=?",
        (status, safe_error, now, job["id"]),
    )
    conn.execute(
        "UPDATE messages SET ocr_status=?, updated_at=? WHERE id=?",
        (status, now, job["message_id"]),
    )
    LOG.warning("job %s failed (%s/%s): %s", job["id"], attempts, MAX_ATTEMPTS, safe_error)


def main() -> int:
    if not DB_PATH.parent.exists():
        LOG.error("database directory does not exist: %s", DB_PATH.parent)
        return 1
    conn = connect()
    recover_stale_jobs(conn)
    engine: RapidOCR | None = None
    last_job_at = time.monotonic()
    LOG.info("started: db=%s files=%s single-concurrency=true", DB_PATH, FILES_DIR)

    while not STOP:
        if not global_ocr_enabled(conn):
            time.sleep(POLL_SECONDS)
            continue
        job = claim_job(conn)
        if job is None:
            if engine is not None and RELEASE_MODEL_AFTER and time.monotonic() - last_job_at >= RELEASE_MODEL_AFTER:
                engine = None
                gc.collect()
                LOG.info("released idle OCR model")
            time.sleep(POLL_SECONDS)
            continue
        try:
            if engine is None:
                LOG.info("loading RapidOCR ONNX models")
                engine = RapidOCR(
                    params={
                        "EngineConfig.onnxruntime.intra_op_num_threads": int(os.getenv("OCR_CPU_THREADS", "1")),
                        "EngineConfig.onnxruntime.inter_op_num_threads": 1,
                        "EngineConfig.onnxruntime.enable_cpu_mem_arena": False,
                        "Global.log_level": os.getenv("OCR_ENGINE_LOG_LEVEL", "warning"),
                        "Det.limit_side_len": DET_LIMIT_SIDE,
                        "Det.limit_type": "max",
                    }
                )
            image_path = safe_image_path(str(job["path"]))
            text = recognize(engine, image_path)
            complete_job(conn, job, text)
            last_job_at = time.monotonic()
            LOG.info("job %s completed: %s chars", job["id"], len(text))
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, RuntimeError) as error:
            fail_job(conn, job, error)
        except Exception as error:  # Keep one malformed job from killing the queue.
            fail_job(conn, job, error)

    conn.close()
    LOG.info("stopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
