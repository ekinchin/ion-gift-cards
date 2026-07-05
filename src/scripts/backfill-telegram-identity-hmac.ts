import { pathToFileURL } from 'node:url';
import type { Knex } from 'knex';
import { db } from '../db/knex.ts';
import { ConfigurationService } from '../configuration/configuration-service.ts';
import { hashTelegramUserId } from '../telegram/telegram-identity.ts';

export interface TelegramIdentityBackfillDb {
  transaction<T>(callback: (trx: TelegramIdentityBackfillDb) => Promise<T>): Promise<T>;
  listCustomerIdentitiesMissingTelegramHmac(): Promise<Array<{ id: string; provider_user_id?: string }>>;
  updateCustomerIdentityTelegramHmac(id: string, telegramUserIdHmac: string): Promise<void>;
  listOperatorsMissingTelegramHmac(): Promise<Array<{ id: string; telegram_id: number }>>;
  updateOperatorTelegramHmac(id: string, telegramUserIdHmac: string): Promise<void>;
}

export interface TelegramIdentityBackfillResult {
  customerIdentitiesUpdated: number;
  operatorsUpdated: number;
}

class KnexTelegramIdentityBackfillDb implements TelegramIdentityBackfillDb {
  readonly #client: Knex | Knex.Transaction;

  constructor(client: Knex | Knex.Transaction) {
    this.#client = client;
  }

  async transaction<T>(callback: (trx: TelegramIdentityBackfillDb) => Promise<T>): Promise<T> {
    if (!('transaction' in this.#client)) {
      return callback(this);
    }

    return this.#client.transaction((trx) => callback(new KnexTelegramIdentityBackfillDb(trx)));
  }

  async listCustomerIdentitiesMissingTelegramHmac() {
    const hasProviderUserId = await this.#client.schema.hasColumn('customer_identities', 'provider_user_id');
    if (!hasProviderUserId) {
      return [];
    }

    return this.#client('customer_identities')
      .select('id', 'provider_user_id')
      .where({ provider: 'telegram' })
      .whereNull('telegram_user_id_hmac')
      .whereNotNull('provider_user_id');
  }

  async updateCustomerIdentityTelegramHmac(id: string, telegramUserIdHmac: string) {
    await this.#client('customer_identities')
      .where({ id })
      .whereNull('telegram_user_id_hmac')
      .update({
        telegram_user_id_hmac: telegramUserIdHmac,
        updated_at: new Date(),
      });
  }

  async listOperatorsMissingTelegramHmac() {
    return this.#client('operators')
      .select('id', 'telegram_id')
      .whereNull('telegram_user_id_hmac')
      .whereNotNull('telegram_id');
  }

  async updateOperatorTelegramHmac(id: string, telegramUserIdHmac: string) {
    await this.#client('operators')
      .where({ id })
      .whereNull('telegram_user_id_hmac')
      .update({ telegram_user_id_hmac: telegramUserIdHmac });
  }
}

export async function backfillTelegramIdentityHmac(options: {
  db?: TelegramIdentityBackfillDb;
  identityHmacSecret: string;
  log?: (message: string) => void;
}): Promise<TelegramIdentityBackfillResult> {
  if (!options.identityHmacSecret || options.identityHmacSecret.length < 32) {
    throw new Error('TELEGRAM_ID_HMAC_SECRET must be set and contain at least 32 characters');
  }

  const backfillDb = options.db ?? new KnexTelegramIdentityBackfillDb(db);
  const log = options.log ?? console.log;

  return backfillDb.transaction(async (trx) => {
    let customerIdentitiesUpdated = 0;
    let operatorsUpdated = 0;

    const identities = await trx.listCustomerIdentitiesMissingTelegramHmac();
    for (const identity of identities) {
      if (!identity.provider_user_id) {
        continue;
      }

      await trx.updateCustomerIdentityTelegramHmac(
        identity.id,
        hashTelegramUserId(identity.provider_user_id, options.identityHmacSecret)
      );
      customerIdentitiesUpdated += 1;
    }

    const operators = await trx.listOperatorsMissingTelegramHmac();
    for (const operator of operators) {
      await trx.updateOperatorTelegramHmac(
        operator.id,
        hashTelegramUserId(operator.telegram_id, options.identityHmacSecret)
      );
      operatorsUpdated += 1;
    }

    log(`Backfilled Telegram identity HMAC values: customer identities=${customerIdentitiesUpdated}, operators=${operatorsUpdated}`);

    return { customerIdentitiesUpdated, operatorsUpdated };
  });
}

async function runCli() {
  const telegramConfig = ConfigurationService.fromEnv().getTelegramConfig();
  await backfillTelegramIdentityHmac({
    identityHmacSecret: telegramConfig.identityHmacSecret,
  });
  await db.destroy();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch(async (error) => {
    console.error('Telegram identity HMAC backfill failed:', error);
    await db.destroy();
    process.exit(1);
  });
}
