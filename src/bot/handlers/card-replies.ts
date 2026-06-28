import { cardOwnershipService, cardService } from '../../services/index.ts';
import type { MyContext } from '../context.ts';

export async function replyBalance(ctx: MyContext, code: string) {
  try {
    const { balance } = await cardService.getBalance(code);
    await ctx.reply(`💳 Карта: ${code}\n💰 Баланс: ${balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

export async function resolveCurrentCustomer(ctx: MyContext) {
  const from = ctx.from;
  if (!from) {
    await ctx.reply('❌ Не удалось определить аккаунт пользователя');
    return null;
  }

  const displayName = [from.first_name, from.last_name].filter(Boolean).join(' ') || undefined;
  const { customer } = await cardOwnershipService.resolveCustomer({
    provider: 'telegram',
    providerUserId: String(from.id),
    username: from.username,
    displayName,
  });
  return customer;
}

export async function replyMyCards(ctx: MyContext) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  const cards = await cardOwnershipService.listCards(customer.id);
  if (cards.length === 0) {
    await ctx.reply('У вас пока нет карты. Создайте её командой /create_my_card или привяжите существующую командой /link <код>.');
    return;
  }

  const card = cards[0]!;
  await ctx.reply(`🎟️ Ваша карта:\n💳 ${card.code}\n💰 Баланс: ${card.balance} ₽`);
}

export async function createPersonalCardForCurrentCustomer(ctx: MyContext) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const { card, created } = await cardOwnershipService.createPersonalCard(customer.id);
    const title = created ? '✅ Ваша карта создана' : 'ℹ️ У вас уже есть карта';
    await ctx.reply(`${title}\n💳 Карта: ${card.code}\n💰 Баланс: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

export async function replyOwnedBalance(ctx: MyContext, code?: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const { card, balance } = await cardOwnershipService.getOwnedBalance(customer.id, code);
    await ctx.reply(`💳 Карта: ${card.code}\n💰 Баланс: ${balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

export async function replyOwnedHistory(ctx: MyContext, code?: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const { card, transactions } = await cardOwnershipService.getOwnedHistory(customer.id, code);
    if (transactions.length === 0) {
      await ctx.reply(`💳 Карта: ${card.code}\n📋 История пуста`);
      return;
    }
    const lines = transactions.slice(0, 10).map((tx) => {
      const sign = tx.type === 'DEBIT' ? '-' : '+';
      const emoji = tx.type === 'DEBIT' ? '🔴' : '🟢';
      return `${emoji} ${sign}${tx.amount} ₽ → ${tx.balance_after} ₽`;
    });
    await ctx.reply(`💳 Карта: ${card.code}\n📋 Последние операции:\n\n${lines.join('\n')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

export async function linkCardToCurrentCustomer(ctx: MyContext, code: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const card = await cardOwnershipService.linkCard(customer.id, code);
    await ctx.reply(`✅ Карта привязана\n💳 Карта: ${card.code}\n💰 Баланс: ${card.balance} ₽`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

export async function unlinkCardFromCurrentCustomer(ctx: MyContext, code: string) {
  const customer = await resolveCurrentCustomer(ctx);
  if (!customer) return;

  try {
    const card = await cardOwnershipService.unlinkCard(customer.id, code);
    await ctx.reply(`✅ Карта отвязана\n💳 Карта: ${card.code}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}

export async function replyHistory(ctx: MyContext, code: string) {
  try {
    const history = await cardService.getHistory(code);
    if (history.length === 0) {
      await ctx.reply(`💳 Карта: ${code}\n📋 История пуста`);
      return;
    }
    const lines = history.slice(0, 10).map((tx) => {
      const sign = tx.type === 'DEBIT' ? '-' : '+';
      const emoji = tx.type === 'DEBIT' ? '🔴' : '🟢';
      return `${emoji} ${sign}${tx.amount} ₽ → ${tx.balance_after} ₽`;
    });
    await ctx.reply(`💳 Карта: ${code}\n📋 Последние операции:\n\n${lines.join('\n')}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка';
    await ctx.reply(`❌ ${message}`);
  }
}
