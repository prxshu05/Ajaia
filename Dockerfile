# Works on any container host (Fly.io, Railway, Cloud Run, ...).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3001 DATA_DIR=/data/pglite
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/server ./server
COPY --from=build /app/client/dist ./client/dist
# Mount a volume at /data to persist the embedded database, or set DATABASE_URL.
VOLUME /data
EXPOSE 3001
CMD ["node", "server/src/index.ts"]
