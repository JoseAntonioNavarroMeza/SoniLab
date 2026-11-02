# Etapa 1: Construcción estática de la SPA React/Vite
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Etapa 2: Servidor web Nginx sin estado y sin privilegios root (compatible con PSA Restricted)
FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --chown=101:101 nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 --from=builder /app/dist /usr/share/nginx/html

USER 101
EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
