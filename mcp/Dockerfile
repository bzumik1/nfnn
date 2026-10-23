# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ARG REVISION=dev
ENV NODE_ENV=production APP_REVISION=$REVISION PORT=8081 BACKEND_URL=http://backend:8080 LOGS_DIR=/logs
WORKDIR /app
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/dist ./dist
COPY package.json ./
USER node
EXPOSE 8081
CMD ["node", "dist/main.js"]
