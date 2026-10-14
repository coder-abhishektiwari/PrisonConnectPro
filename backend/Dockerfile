FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

# Migrations run on every startup and must succeed; a failure means the code
# would read tables that do not exist yet, so refuse to boot rather than serve
# 500s (a dead API looks like "invalid credentials" on the login screen).
CMD ["sh", "-c", "node lib/migrate.js || exit 1; exec node server.js"]
