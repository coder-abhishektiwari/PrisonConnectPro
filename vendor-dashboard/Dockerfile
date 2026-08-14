FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ARG VITE_API_GATEWAY_URL=http://127.0.0.1:3001
ARG VITE_SIGNALING_URL=http://127.0.0.1:3002
ARG VITE_DEFAULT_USERNAME=admin
ARG VITE_DEFAULT_PASSWORD=admin
ENV VITE_API_GATEWAY_URL=$VITE_API_GATEWAY_URL
ENV VITE_SIGNALING_URL=$VITE_SIGNALING_URL
ENV VITE_DEFAULT_USERNAME=$VITE_DEFAULT_USERNAME
ENV VITE_DEFAULT_PASSWORD=$VITE_DEFAULT_PASSWORD

RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]