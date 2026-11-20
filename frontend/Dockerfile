# Step 1: build the React app into plain HTML/JS/CSS files.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Step 2: serve those files with nginx, which also passes /api to the backend.
FROM nginx:1.27-alpine

# These defaults suit docker-compose; Render sets its own values.
ENV PORT=80 \
    BACKEND_URL=http://backend:5000

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/15-resolver.envsh /docker-entrypoint.d/15-resolver.envsh
# Strip Windows line endings so the script runs even if the repo was cloned on Windows.
RUN chmod +x /docker-entrypoint.d/15-resolver.envsh \
    && sed -i 's/\r$//' /docker-entrypoint.d/15-resolver.envsh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
