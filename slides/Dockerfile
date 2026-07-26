FROM node:24-alpine AS build

WORKDIR /app
COPY slides/package.json slides/package-lock.json ./
RUN npm ci

COPY slides/ ./
COPY kernel/ /kernel/
COPY scripts/ /scripts/
RUN npm run build:single

FROM nginx:1.27-alpine

COPY slides/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist-single/Bento_Slides.bento.html /usr/share/nginx/html/index.html

EXPOSE 80
