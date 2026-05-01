# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration=production

FROM nginx:1.29-alpine
COPY --from=build /workspace/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
