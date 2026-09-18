# syntax=docker/dockerfile:1
# Multi-stage build for the API. Debian-slim (not alpine): the Prisma CLI's engines need glibc.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma.config.ts tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
# Production dependencies only. The Prisma CLI is a runtime dependency here: the container applies
# migrations on start (copying the build stage's node_modules instead made the image ~1 GB).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 4000
# Migrations run at start so a fresh database is usable; seeding stays a manual step.
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
