FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ARG VITE_API_GATEWAY_URL=http://127.0.0.1:3001
ARG VITE_SIGNALING_URL=http://127.0.0.1:3002
ARG VITE_WEBRTC_ICE_SERVERS=[{"urls":"turn:127.0.0.1:3478"}]
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL
ENV VITE_SIGNALING_URL=$VITE_SIGNALING_URL
ENV VITE_WEBRTC_ICE_SERVERS=$VITE_WEBRTC_ICE_SERVERS

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]