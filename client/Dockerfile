# Build context is the repo root (see docker-compose.yml): the client installs
# from the root workspace lockfile alongside @matchsticked/shared.
# Debian-based rather than Alpine because the lockfile pins the glibc (-gnu)
# Tailwind/LightningCSS native bindings.
FROM node:20-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/ ./shared/
COPY client/package.json ./client/
RUN npm ci --workspace client --no-audit --no-fund

COPY client/ ./client/

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ARG NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build --workspace client

FROM node:20-slim AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# In a workspace, standalone output mirrors the repo layout: server.js lives under client/.
COPY --from=builder /app/client/.next/standalone ./
COPY --from=builder /app/client/.next/static ./client/.next/static
COPY --from=builder /app/client/public ./client/public

EXPOSE 3000
CMD ["node", "client/server.js"]
