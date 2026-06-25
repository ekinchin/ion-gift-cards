import { configureBotApi, createBot } from './index.ts';

const bot = createBot();

await configureBotApi(bot);
bot.start();

console.log('Bot long polling started');
