import type { FastifyInstance } from 'fastify';
import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { requireAuth } from './auth.js';
import { setting, setSetting } from './db.js';

const MAX_ICON_BYTES = 2 * 1024 * 1024;

function iconDirectory(app: FastifyInstance) { return path.join(app.config.dataDir, 'appearance'); }
function iconPath(app: FastifyInstance, size: 192 | 512) { return path.join(iconDirectory(app), `pwa-icon-${size}.png`); }
function iconState(app: FastifyInstance) {
  return {
    custom: setting(app.db, 'pwa_icon_custom') === 'true',
    version: Number(setting(app.db, 'pwa_icon_version')) || 2,
    siteTitle: setting(app.db, 'site_title') ?? '渡口',
    tabTitle: setting(app.db, 'tab_title') ?? '渡口 · 私人传输助手',
  };
}

function manifest(version: number, siteTitle: string, tabTitle: string) {
  const icon = (size: 192 | 512) => `/api/appearance/icon/${size}.png?v=${version}`;
  return {
    name: tabTitle,
    short_name: siteTitle,
    description: '私人文件传输与跨设备粘贴板',
    theme_color: '#f6f3ed',
    background_color: '#f6f3ed',
    display: 'standalone',
    start_url: '/',
    share_target: {
      action: '/share-target', method: 'POST', enctype: 'multipart/form-data',
      params: { title: 'title', text: 'text', url: 'url', files: [{ name: 'files', accept: ['*/*'] }] },
    },
    icons: [
      { src: icon(192), sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: icon(512), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

function validPng(buffer: Buffer, size: 192 | 512) {
  return buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    && buffer.readUInt32BE(16) === size
    && buffer.readUInt32BE(20) === size;
}

async function writeIconSet(app: FastifyInstance, small: Buffer, large: Buffer) {
  const directory = iconDirectory(app), token = nanoid();
  await fs.mkdir(directory, { recursive: true });
  const temporary = ([192, 512] as const).map(size => path.join(directory, `.pwa-icon-${size}-${token}.tmp`));
  try {
    await Promise.all([fs.writeFile(temporary[0], small), fs.writeFile(temporary[1], large)]);
    await fs.copyFile(temporary[0], iconPath(app, 192));
    await fs.copyFile(temporary[1], iconPath(app, 512));
  } finally {
    await Promise.all(temporary.map(file => fs.rm(file, { force: true })));
  }
}

export async function appearanceRoutes(app: FastifyInstance) {
  app.get('/api/appearance', async () => iconState(app));
  app.get('/api/appearance/manifest.webmanifest', async (_req, reply) => {
    const { version, siteTitle, tabTitle } = iconState(app);
    return reply.header('Cache-Control', 'no-cache').type('application/manifest+json').send(manifest(version, siteTitle, tabTitle));
  });
  app.get('/api/appearance/icon/:size.png', async (req, reply) => {
    const { size } = z.object({ size: z.coerce.number().pipe(z.union([z.literal(192), z.literal(512)])) }).parse(req.params);
    const state = iconState(app);
    if (!state.custom) return reply.redirect(`/icon-${size}.png?v=2`);
    try {
      await fs.access(iconPath(app, size));
    } catch {
      return reply.redirect(`/icon-${size}.png?v=2`);
    }
    const versioned = Boolean((req.query as { v?: string }).v);
    return reply.header('Cache-Control', versioned ? 'public, max-age=31536000, immutable' : 'no-cache').type('image/png').send(createReadStream(iconPath(app, size)));
  });
  app.post('/api/settings/pwa-icon', { preHandler: requireAuth(app, true), bodyLimit: MAX_ICON_BYTES * 2 + 4096 }, async (req, reply) => {
    const received = new Map<string, Buffer>();
    for await (const file of req.files({ limits: { files: 2, fileSize: MAX_ICON_BYTES } })) {
      if (file.mimetype !== 'image/png' || !['icon192', 'icon512'].includes(file.fieldname)) return reply.code(415).send({ error: 'unsupported_pwa_icon' });
      const input = await file.toBuffer();
      if (file.file.truncated || input.length > MAX_ICON_BYTES) return reply.code(413).send({ error: 'pwa_icon_too_large' });
      received.set(file.fieldname, input);
    }
    const small = received.get('icon192'), large = received.get('icon512');
    if (!small || !large || !validPng(small, 192) || !validPng(large, 512)) return reply.code(400).send({ error: 'invalid_pwa_icon' });
    await writeIconSet(app, small, large);
    const version = Date.now();
    setSetting(app.db, 'pwa_icon_custom', 'true');
    setSetting(app.db, 'pwa_icon_version', String(version));
    return { custom: true, version };
  });
  app.delete('/api/settings/pwa-icon', { preHandler: requireAuth(app, true) }, async () => {
    await Promise.all(([192, 512] as const).map(size => fs.rm(iconPath(app, size), { force: true })));
    const version = Date.now();
    setSetting(app.db, 'pwa_icon_custom', 'false');
    setSetting(app.db, 'pwa_icon_version', String(version));
    return { custom: false, version };
  });
}
