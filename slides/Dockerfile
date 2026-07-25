FROM node:24-alpine AS build

WORKDIR /app
COPY slides/package.json slides/package-lock.json ./
RUN npm ci

COPY slides/ ./
COPY kernel/ /kernel/
RUN npm run build

FROM nginx:1.27-alpine

COPY slides/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
