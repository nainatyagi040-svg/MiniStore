FROM node:24-alpine

WORKDIR /app

# Copy package descriptors
COPY package.json package-lock.json ./
COPY protocol/package.json ./protocol/
COPY store-engine/package.json ./store-engine/
COPY dashboard/package.json ./dashboard/
COPY cli/package.json ./cli/

# Install dependencies
RUN npm ci

# Copy full source
COPY . .

# Build dependencies and store-engine
RUN npm run build --workspace @ministore/protocol && \
    npm run build --workspace @ministore/store-engine

# Setup persistence directory
ENV MINISTORE_DUMP_PATH=/data/dump.json
ENV MINISTORE_AOF_PATH=/data/appendonly.aof
RUN mkdir -p /data

EXPOSE 6380
EXPOSE 8090

CMD ["npm", "start", "--workspace", "@ministore/store-engine"]
