FROM node:20-alpine AS builder

WORKDIR /app/client

# Copy shared types to ../shared (same relative path as local dev)
COPY shared/ /app/shared/

# Copy client files
COPY client/package.json client/package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY client/ ./

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_SOCKET_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_SOCKET_URL=$NEXT_PUBLIC_SOCKET_URL

RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/client/package.json ./
COPY --from=builder /app/client/.next/standalone ./
COPY --from=builder /app/client/.next/static ./.next/static
COPY --from=builder /app/client/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
