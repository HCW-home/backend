FROM node:16

# Create app directory
WORKDIR /usr/src/app

COPY package*.json ./

RUN npx yarn

COPY . .

EXPOSE 1337

CMD [ "node", "app.js" ]