# syntax=docker/dockerfile:1.7

FROM node:25-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:25-alpine
ARG REVISION=dev
RUN apk add --no-cache su-exec
ENV NODE_ENV=production APP_REVISION=$REVISION PORT=8081 BACKEND_URL=http://backend:8080 LOG_FILE=/logs/mcp.log
WORKDIR /app
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist ./dist
COPY package.json ./
COPY --chmod=0755 rotate-log.sh /usr/local/bin/rotate-log
COPY --chmod=0755 docker-entrypoint.sh /app/docker-entrypoint.sh
EXPOSE 8081
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
