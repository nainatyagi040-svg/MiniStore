FROM node:24-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY protocol/package.json ./protocol/
COPY store-engine/package.json ./store-engine/
COPY dashboard/package.json ./dashboard/
COPY cli/package.json ./cli/

RUN npm ci

COPY . .

RUN npm run build --workspace @ministore/protocol && \
    npm run build --workspace @ministore/store-engine

# Remove devDependencies to keep the production image lean
RUN npm prune --omit=dev

FROM node:24-alpine AS runner

WORKDIR /app

# Copy pruned node_modules and built dist folders
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/protocol/package.json ./protocol/
COPY --from=builder /app/protocol/dist ./protocol/dist
COPY --from=builder /app/store-engine/package.json ./store-engine/
COPY --from=builder /app/store-engine/dist ./store-engine/dist

ENV NODE_ENV=production
ENV MINISTORE_DUMP_PATH=/data/dump.json
ENV MINISTORE_AOF_PATH=/data/appendonly.aof

RUN mkdir -p /data

EXPOSE 6380
EXPOSE 8090

CMD ["npm", "start", "--workspace", "@ministore/store-engine"]
