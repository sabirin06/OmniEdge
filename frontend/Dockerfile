# Build the React (Vite) app, then serve it with Nginx, which also proxies
# /api/ and /admin/ to the Django container.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
