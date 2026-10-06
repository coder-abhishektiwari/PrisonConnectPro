FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3001

# Migrations run on every startup and must succeed; the seed is best-effort so
# a single bad collection can never keep the API from booting (a dead API looks
# like "invalid credentials" on the login screen).
CMD ["sh", "-c", "node lib/migrate.js || exit 1; node lib/seed.js || echo '[seed] failed - starting server anyway'; exec node server.js"]
