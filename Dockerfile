FROM node:24-alpine AS base
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

# Telegram Bot (local long polling)
FROM base AS bot-long-polling
CMD ["node", "--experimental-strip-types", "src/bot/long-polling.ts"]

# Telegram Bot (production webhook)
FROM base AS bot-webhook
EXPOSE 3000
CMD ["node", "--experimental-strip-types", "src/bot/webhook.ts"]
