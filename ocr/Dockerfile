# syntax=docker/dockerfile:1.7
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1

RUN groupadd --gid 10001 transfer \
    && useradd --uid 10001 --gid transfer --shell /usr/sbin/nologin --create-home transfer \
    && mkdir -p /worker /data/files /data/tmp \
    && chown -R transfer:transfer /worker /data

WORKDIR /worker
COPY ocr/requirements.txt ./requirements.txt
RUN --mount=type=cache,target=/root/.cache/pip pip install -r requirements.txt \
    && rapidocr check
COPY --chown=transfer:transfer ocr/worker.py ./worker.py

USER transfer
STOPSIGNAL SIGTERM
CMD ["python", "worker.py"]

