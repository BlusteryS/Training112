# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /build
COPY package.json package-lock.json ./
COPY icons/package.json ./icons/
COPY components/package.json ./components/
COPY site/package.json ./site/
RUN --mount=type=cache,target=/root/.npm npm ci
COPY tsconfig.json tsconfig.base.json ./
COPY icons ./icons
COPY components ./components
COPY site ./site
RUN npm run build

FROM nginx:1.30-alpine
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /build/site/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
