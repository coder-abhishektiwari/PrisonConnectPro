FROM node:22-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3003 40000-49999/udp
CMD ["node", "server.js"]