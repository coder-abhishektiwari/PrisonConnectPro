FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

# Migrations + seed run automatically on startup if the schema is not present.
EXPOSE 3001

CMD ["sh", "-c", "node lib/migrate.js && node lib/seed.js && node server.js"]
