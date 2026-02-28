FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Миграции (завершается после выполнения)
FROM base AS migrations
CMD ["node", "--experimental-strip-types", "src/db/migrations/run.ts"]

# API сервер
FROM base AS api
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "src/index.ts"]

# Telegram Bot
FROM base AS bot
CMD ["node", "--experimental-strip-types", "src/bot/index.ts"]
