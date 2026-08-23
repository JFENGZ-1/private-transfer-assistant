# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/package.json
COPY apps/web/package.json apps/web/package.json
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS build
COPY apps ./apps
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    DB_PATH=/data/transfer.db \
    FILES_DIR=/data/files \
    UPLOAD_DIR=/data/files \
    TEMP_DIR=/data/tmp

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates dumb-init sqlite3 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 transfer \
    && useradd --uid 10001 --gid transfer --shell /usr/sbin/nologin --create-home transfer \
    && mkdir -p /data/files /data/tmp /app \
    && chown -R transfer:transfer /data /app

WORKDIR /app
COPY --from=build --chown=transfer:transfer /app/package.json /app/package-lock.json ./
COPY --from=build --chown=transfer:transfer /app/node_modules ./node_modules
COPY --from=build --chown=transfer:transfer /app/apps/server/package.json ./apps/server/package.json
COPY --from=build --chown=transfer:transfer /app/apps/server/dist ./apps/server/dist
COPY --from=build --chown=transfer:transfer /app/apps/web/dist ./apps/web/dist
COPY --chown=transfer:transfer scripts ./scripts

USER transfer
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/auth/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "apps/server/dist/index.js"]

