# Etapa 1: Construcción y dependencias nativas para Linux Alpine
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Etapa 2: Imagen de ejecución mínima y segura
FROM node:20-alpine
WORKDIR /app

# Crear usuario y grupo no-root explícito
RUN addgroup -g 10001 appgroup && \
    adduser -u 10001 -G appgroup -s /bin/sh -D appuser

# Copiar únicamente node_modules compilados en Linux y el código fuente
COPY --from=builder --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --chown=appuser:appgroup package*.json ./
COPY --chown=appuser:appgroup src ./src

# Usar el usuario sin privilegios
USER 10001

EXPOSE 3000
CMD ["node", "src/index.js"]
