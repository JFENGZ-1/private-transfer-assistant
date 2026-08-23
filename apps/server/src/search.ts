import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireAuth } from './auth.js'
import { setting } from './db.js'

const queryBoolean = z.preprocess(value => typeof value === 'string' ? (value === 'true' || value === '1' ? true : value === 'false' || value === '0' ? false : value) : value, z.boolean())
const columnMap = { text: ['content', 'note', 'tags'], fileName: ['file_name'], imageName: ['file_name'], ocr: ['ocr_text'] } as const
const searchType = z.enum(['all', 'text', 'file', 'image', 'video', 'media', 'audio', 'link', 'document', 'archive', 'other'])
const fields = `m.id,m.type,m.content,m.file_name AS fileName,m.mime,m.size,m.sha256,m.source_device_id AS sourceDeviceId,m.source_session_id AS sourceSessionId,m.source_name AS sourceDeviceName,m.visibility,m.favorite,m.pinned,m.created_at AS createdAt,m.updated_at AS updatedAt,m.ocr_status AS ocrStatus,m.tags,m.note`

export function safeFtsQuery(input: string, columns: string[]): string | undefined {
  const tokens = input.normalize('NFKC').match(/[\p{L}\p{N}_]+/gu)?.slice(0, 20)
  if (!tokens?.length || !columns.length) return
  const expression = tokens.map(token => `"${token.replaceAll('"', '""')}"`).join(' AND ')
  return `{${columns.join(' ')}} : (${expression})`
}

function visibleSql(kind: 'temporary' | 'device', hasDevice: boolean) {
  return [
    kind === 'device' ? '1=1' : "m.visibility='normal'",
    `(NOT EXISTS(SELECT 1 FROM message_targets mt WHERE mt.message_id=m.id) ${hasDevice ? 'OR m.source_device_id=@principalDevice OR EXISTS(SELECT 1 FROM message_targets mt WHERE mt.message_id=m.id AND mt.device_id=@principalDevice)' : ''})`,
  ]
}

function applyType(where: string[], type: z.infer<typeof searchType>) {
  if (type === 'text') where.push("m.type='text'")
  if (type === 'file') where.push("m.type='file' AND COALESCE(m.mime,'') NOT LIKE 'image/%' AND COALESCE(m.mime,'') NOT LIKE 'video/%' AND COALESCE(m.mime,'') NOT LIKE 'audio/%'")
  if (type === 'image') where.push("m.mime LIKE 'image/%'")
  if (type === 'video') where.push("m.mime LIKE 'video/%'")
  if (type === 'media') where.push("(m.mime LIKE 'image/%' OR m.mime LIKE 'video/%')")
  if (type === 'audio') where.push("m.mime LIKE 'audio/%'")
  if (type === 'link') where.push("m.type='text' AND (lower(m.content) LIKE '%http://%' OR lower(m.content) LIKE '%https://%' OR lower(m.content) LIKE '%www.%')")
  if (type === 'document') where.push("m.type='file' AND (m.mime LIKE 'text/%' OR m.mime IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation') OR lower(m.file_name) GLOB '*.doc*' OR lower(m.file_name) GLOB '*.xls*' OR lower(m.file_name) GLOB '*.ppt*')")
  if (type === 'archive') where.push("m.type='file' AND (m.mime IN ('application/zip','application/x-rar-compressed','application/x-7z-compressed','application/gzip','application/x-tar') OR lower(m.file_name) GLOB '*.zip' OR lower(m.file_name) GLOB '*.rar' OR lower(m.file_name) GLOB '*.7z' OR lower(m.file_name) GLOB '*.tar*' OR lower(m.file_name) GLOB '*.gz')")
  if (type === 'other') where.push("m.type='file' AND (m.mime IS NULL OR (m.mime NOT LIKE 'image/%' AND m.mime NOT LIKE 'video/%' AND m.mime NOT LIKE 'audio/%')) AND COALESCE(m.mime,'') NOT LIKE 'text/%' AND COALESCE(m.mime,'') NOT IN ('application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip','application/x-rar-compressed','application/x-7z-compressed','application/gzip','application/x-tar')")
}

export async function searchRoutes(app: FastifyInstance) {
  app.get('/api/search/facets', { preHandler: requireAuth(app) }, async req => {
    const principal = req.principal!
    const where = ['m.deleted_at IS NULL', ...visibleSql(principal.kind, Boolean(principal.deviceId)), "m.source_name IS NOT NULL", "trim(m.source_name)<>''"]
    const sources = app.db.prepare(`SELECT m.source_name AS name,count(*) AS count FROM messages m WHERE ${where.join(' AND ')} GROUP BY m.source_name ORDER BY max(m.created_at) DESC`).all({ principalDevice: principal.deviceId })
    return { sources }
  })

  app.get('/api/search', { preHandler: requireAuth(app) }, async req => {
    const q = z.object({
      q: z.string().max(200).optional().default(''), images: queryBoolean.default(true), scope: z.string().max(80).optional(), type: searchType.default('all'),
      favorite: queryBoolean.optional(), pinned: queryBoolean.optional(), privateOnly: queryBoolean.default(false), deviceId: z.string().optional(), sourceName: z.string().max(80).optional(),
      from: z.coerce.number().optional(), to: z.coerce.number().optional(), cursor: z.coerce.number().optional(), limit: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(req.query)
    const principal = req.principal!
    if (q.privateOnly && principal.kind !== 'device') return { items: [], pendingOcr: 0 }

    const requested = q.scope?.split(',').filter((value): value is keyof typeof columnMap => value in columnMap) ?? ['text', 'fileName', 'imageName', 'ocr']
    const ocrEnabled = setting(app.db, 'ocr_enabled') !== 'false'
    const scopes = requested.filter(value => value !== 'ocr' || (q.images && ocrEnabled))
    const phrase = q.q.trim()
    const where = ['m.deleted_at IS NULL', ...visibleSql(principal.kind, Boolean(principal.deviceId))]
    applyType(where, q.type)
    if (q.favorite !== undefined) where.push('m.favorite=@favorite')
    if (q.pinned !== undefined) where.push('m.pinned=@pinned')
    if (q.privateOnly) where.push("m.visibility='trusted_only'")
    if (q.deviceId) where.push('m.source_device_id=@sourceDevice')
    if (q.sourceName) where.push('m.source_name=@sourceName')
    if (q.from) where.push('m.created_at>=@from')
    if (q.to) where.push('m.created_at<=@to')
    if (q.cursor) where.push('m.created_at<@cursor')
    const params = { principalDevice: principal.deviceId, favorite: Number(q.favorite), pinned: Number(q.pinned), sourceDevice: q.deviceId, sourceName: q.sourceName, from: q.from, to: q.to, cursor: q.cursor, limit: q.limit }

    if (!phrase) {
      const items = app.db.prepare(`SELECT ${fields},NULL AS snippet FROM messages m WHERE ${where.join(' AND ')} ORDER BY m.created_at DESC LIMIT @limit`).all(params)
      return { items, pendingOcr: 0, nextCursor: items.length === q.limit ? (items.at(-1) as { createdAt: number }).createdAt : null }
    }

    const plans: { scope: keyof typeof columnMap; columns: readonly string[]; row: string }[] = []
    if (scopes.includes('text')) plans.push({ scope: 'text', columns: columnMap.text, row: '1=1' })
    if (scopes.includes('fileName')) plans.push({ scope: 'fileName', columns: columnMap.fileName, row: "m.type='file' AND COALESCE(m.mime,'') NOT LIKE 'image/%'" })
    if (scopes.includes('imageName')) plans.push({ scope: 'imageName', columns: columnMap.imageName, row: "m.mime LIKE 'image/%'" })
    if (scopes.includes('ocr')) plans.push({ scope: 'ocr', columns: columnMap.ocr, row: "m.mime LIKE 'image/%'" })
    const matches = new Map<string, Record<string, unknown> & { _rank: number }>()
    for (const plan of plans) {
      const query = safeFtsQuery(phrase, [...plan.columns]); if (!query) continue
      const rows = app.db.prepare(`SELECT ${fields},snippet(messages_fts,-1,'<mark>','</mark>','…',18) AS snippet,bm25(messages_fts) AS _rank FROM messages_fts f JOIN messages m ON m.id=f.message_id WHERE messages_fts MATCH @query AND ${where.join(' AND ')} AND ${plan.row} ORDER BY _rank,m.created_at DESC LIMIT @limit`).all({ ...params, query }) as (Record<string, unknown> & { id: string; _rank: number })[]
      for (const row of rows) if (!matches.has(row.id) || row._rank < matches.get(row.id)!._rank) matches.set(row.id, { ...row, matchScope: plan.scope })
    }
    // unicode61 treats an uninterrupted Chinese sentence as one token, so FTS cannot
    // find a shorter phrase inside it. Keep FTS for ranking and use a bounded OCR-only
    // substring fallback so Chinese OCR remains discoverable on small private servers.
    if (scopes.includes('ocr')) {
      const rows = app.db.prepare(`SELECT ${fields},substr(m.ocr_text,max(1,instr(lower(m.ocr_text),lower(@ocrPhrase))-30),length(@ocrPhrase)+90) AS snippet,1000 AS _rank FROM messages m WHERE ${where.join(' AND ')} AND m.mime LIKE 'image/%' AND instr(lower(COALESCE(m.ocr_text,'')),lower(@ocrPhrase))>0 ORDER BY m.created_at DESC LIMIT @limit`).all({ ...params, ocrPhrase: phrase }) as (Record<string, unknown> & { id: string; _rank: number })[]
      for (const row of rows) if (!matches.has(row.id)) matches.set(row.id, { ...row, matchScope: 'ocr' })
    }
    const items = [...matches.values()].sort((a, b) => a._rank - b._rank || Number(b.createdAt) - Number(a.createdAt)).slice(0, q.limit).map(({ _rank: _unused, ...item }) => item)
    const pendingOcr = scopes.includes('ocr') ? (app.db.prepare(`SELECT count(*) AS count FROM messages m WHERE m.deleted_at IS NULL AND m.ocr_status IN ('pending','processing') AND ${visibleSql(principal.kind, Boolean(principal.deviceId)).join(' AND ')}`).get({ principalDevice: principal.deviceId }) as { count: number }).count : 0
    return { items, pendingOcr, nextCursor: items.length === q.limit ? (items.at(-1) as { createdAt: number }).createdAt : null }
  })
}

