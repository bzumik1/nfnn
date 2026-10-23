# syntax=docker/dockerfile:1.7

FROM node:25-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration=production

FROM nginx:1.30-alpine
RUN mkdir -p /logs
COPY --from=build /workspace/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --chmod=0755 rotate-log.sh /usr/local/bin/rotate-log
COPY --chmod=0755 rotate-access-log.sh /docker-entrypoint.d/40-rotate-access-log.sh
EXPOSE 80
