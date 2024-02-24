FROM node:18-alpine

WORKDIR /app

COPY package.json .

ARG REGISTRY=https://registry.npmmirror.com

RUN npm install --registry=$REGISTRY

COPY . .

EXPOSE 3000

CMD node src/main.js
