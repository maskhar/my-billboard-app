# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

FROM dependencies AS development
ENV NODE_ENV=development
COPY . .
RUN npx prisma generate
EXPOSE 3000
CMD ["npx", "next", "dev", "-H", "0.0.0.0", "-p", "3000"]

FROM dependencies AS builder
ARG NEXT_PUBLIC_CHAT_ENABLED=false
ARG NEXT_PUBLIC_CHAT_URL=
ARG NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=
ARG NEXT_PUBLIC_CLOUDINARY_PRESET=
ENV NODE_ENV=production \
    NEXT_PUBLIC_CHAT_ENABLED=$NEXT_PUBLIC_CHAT_ENABLED \
    NEXT_PUBLIC_CHAT_URL=$NEXT_PUBLIC_CHAT_URL \
    NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=$NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME \
    NEXT_PUBLIC_CLOUDINARY_PRESET=$NEXT_PUBLIC_CLOUDINARY_PRESET \
    DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build \
    NEXTAUTH_SECRET=build-only-placeholder \
    NEXTAUTH_URL=https://example.invalid \
    APP_ORIGIN=https://example.invalid
COPY . .
RUN npx prisma generate && npm run build

FROM dependencies AS migrator
COPY . .
RUN npx prisma generate

FROM node:22-bookworm-slim AS production
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 1001 nodejs \
    && useradd --system --uid 1001 --gid nodejs nextjs \
    && mkdir -p /app/uploads/private/designs \
    && chown -R nextjs:nodejs /app
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
