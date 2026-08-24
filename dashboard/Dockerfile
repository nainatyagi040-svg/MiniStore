FROM node:24-alpine AS builder

WORKDIR /app

# Copy root package.json and lockfile for workspace resolution
COPY package.json package-lock.json ./
COPY dashboard/package.json ./dashboard/

# Install dependencies
RUN npm ci

# Copy dashboard source
COPY dashboard ./dashboard

# Build dashboard
WORKDIR /app/dashboard
RUN npm run build

# Production stage using NGINX
FROM nginx:alpine

# Copy built assets to NGINX serve directory
COPY --from=builder /app/dashboard/dist /usr/share/nginx/html

# Create an nginx configuration to support React Router and listen on port 3000
RUN echo $'server {\n\
    listen 3000;\n\
    location / {\n\
        root /usr/share/nginx/html;\n\
        index index.html index.htm;\n\
        try_files $uri $uri/ /index.html;\n\
    }\n\
}' > /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
