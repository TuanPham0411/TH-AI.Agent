# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; npm ci --strict-ssl=true
COPY . .
RUN npm test && npm run build && npm prune --omit=dev
FROM node:22-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 FILES_ROOT=/var/lib/th-ai/files
COPY --from=build --chown=node:node /app/dist/server ./server
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
RUN mkdir -p /var/lib/th-ai/files && chown -R node:node /var/lib/th-ai
USER node
EXPOSE 3100
CMD ["node","server/index.js"]
FROM nginx:stable-alpine AS web
COPY --from=build /app/dist/web /usr/share/nginx/html
COPY deploy/docker-nginx.conf /etc/nginx/conf.d/default.conf
