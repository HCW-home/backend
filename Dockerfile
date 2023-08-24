FROM node:16

WORKDIR /usr/src/app

COPY package*.json ./

RUN npx yarn

COPY . .

EXPOSE 1337

RUN chown node -R /usr/src/app/.tmp && chown node -R /usr/src/app/views
USER node

CMD [ "node", "app.js" ]