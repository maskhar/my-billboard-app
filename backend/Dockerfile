FROM node:24.22.1-bookworm-slim AS build
WORKDIR /app/backend
ENV NODE_ENV=development
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY backend/package.json backend/package-lock.json ./
COPY backend/.npmrc ./
RUN npm ci
COPY backend/ ./
RUN PRISMA_GENERATE_SKIP_AUTOINSTALL=1 npx prisma generate --schema=prisma/schema.prisma \
    && npm run build

FROM node:24.22.1-bookworm-slim AS runtime
WORKDIR /app/backend
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/prisma ./prisma
EXPOSE 4001
CMD ["node", "dist/src/main.js"]

