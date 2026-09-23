# syntax=docker/dockerfile:1
FROM node:24-alpine AS build
WORKDIR /build
COPY package.json package-lock.json tsconfig.json tsconfig.base.json ./
COPY site/package.json ./site/
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY site ./site
RUN npm run build

FROM nginx:1.30-alpine
COPY deploy/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /build/site/dist /usr/share/nginx/html
USER nginx
EXPOSE 8443
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
