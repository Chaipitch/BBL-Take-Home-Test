# syntax=docker/dockerfile:1
# Vite inlines VITE_* values at build time, so the API and Auth0 settings are build arguments.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_API_BASE_URL=http://localhost:4000
ARG VITE_AUTH0_DOMAIN=dev-yg.us.auth0.com
ARG VITE_AUTH0_CLIENT_ID=H9F6QG5SzTKMv0tbmgxLj9LjG1EKVllA
ARG VITE_AUTH0_AUDIENCE=https://bbl-candidate-test-api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL VITE_AUTH0_DOMAIN=$VITE_AUTH0_DOMAIN VITE_AUTH0_CLIENT_ID=$VITE_AUTH0_CLIENT_ID VITE_AUTH0_AUDIENCE=$VITE_AUTH0_AUDIENCE
RUN npm run build

FROM nginx:1.29-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Port 3000 because the Auth0 client's callback/logout URLs point at http://localhost:3000.
EXPOSE 3000
