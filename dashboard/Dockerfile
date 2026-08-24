FROM node:24-alpine AS build

WORKDIR /app

# Copy package descriptors
COPY package.json package-lock.json ./
COPY protocol/package.json ./protocol/
COPY store-engine/package.json ./store-engine/
COPY dashboard/package.json ./dashboard/
COPY cli/package.json ./cli/

RUN npm ci

# Copy full source
COPY . .

# Build the dashboard
RUN npm run build --workspace dashboard

# Serve stage
FROM node:24-alpine

WORKDIR /app
RUN npm install -g serve
COPY --from=build /app/dashboard/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
