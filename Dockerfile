# -------------------------
# Stage 1: build the Angular app
# -------------------------
FROM node:20 AS build

WORKDIR /app

# copy package metadata first to cache npm install
COPY package.json package-lock.json ./

# install deps
RUN npm ci

# copy the rest of the project
COPY . .

# build production bundle into a fixed folder (dist/app)
RUN npm run build -- --configuration production --output-path=dist/zet-flow

# -------------------------
# Stage 2: nginx to serve the built app (with runtime env injection)
# -------------------------
FROM nginx:stable-alpine

LABEL maintainer="me@example.com"

# copy built files into nginx html root
COPY --from=build /app/dist/zet-flow/browser /usr/share/nginx/html

# provide nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# add the entrypoint that substitutes env vars at runtime
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# copy the config template into assets
COPY src/assets/config.template.js /usr/share/nginx/html/assets/config.template.js

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
