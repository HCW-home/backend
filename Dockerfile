FROM node:18 AS builder

WORKDIR /usr/src/app

COPY package.json ./
COPY yarn.lock ./

RUN npx yarn

COPY .sailsrc .
COPY app.js .
COPY api ./api
COPY config ./config
COPY public ./public
COPY views ./views

FROM node:18

WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/ /usr/src/app/

EXPOSE 1337

USER node

CMD [ "node", "app.js" ]
