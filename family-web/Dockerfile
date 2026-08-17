FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ARG VITE_API_GATEWAY_URL
ARG VITE_SIGNALING_URL
ARG VITE_WEBRTC_ICE_SERVERS='[]'
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL
ENV VITE_SIGNALING_URL=$VITE_SIGNALING_URL
ENV VITE_WEBRTC_ICE_SERVERS=$VITE_WEBRTC_ICE_SERVERS

RUN test -n "$VITE_API_GATEWAY_URL" && test -n "$VITE_SIGNALING_URL" || (echo '[build] VITE_API_GATEWAY_URL and VITE_SIGNALING_URL are REQUIRED build args (public Render URLs). No localhost defaults are allowed.' && exit 1)

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]