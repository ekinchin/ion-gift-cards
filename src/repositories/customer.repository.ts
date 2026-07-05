import { db } from '../db/knex.ts';
import type { Knex } from 'knex';
import type { Customer, CustomerIdentity, IdentityProvider } from '../types/index.ts';

function client(trx?: Knex.Transaction) {
  return trx ?? db;
}

export interface ResolveIdentityData {
  provider: IdentityProvider;
  telegramUserIdHash: string;
  username?: string;
  displayName?: string;
}

export interface ResolvedCustomerIdentity {
  customer: Customer;
  identity: CustomerIdentity;
}

export class CustomerRepository {
  async findByTelegramUserIdHash(
    telegramUserIdHash: string,
    trx?: Knex.Transaction
  ): Promise<ResolvedCustomerIdentity | null> {
    const identity = await client(trx)('customer_identities')
      .where({
        provider: 'telegram',
        telegram_user_id_hmac: telegramUserIdHash,
      })
      .first<CustomerIdentity>();

    if (!identity) {
      return null;
    }

    const customer = await this.findById(identity.customer_id, trx);
    if (!customer) {
      throw new Error('Customer identity points to missing customer');
    }

    return { customer, identity };
  }

  async resolveOrCreateIdentity(
    data: ResolveIdentityData,
    trx?: Knex.Transaction
  ): Promise<ResolvedCustomerIdentity> {
    const existing = await client(trx)('customer_identities')
      .where({
        provider: data.provider,
        telegram_user_id_hmac: data.telegramUserIdHash,
      })
      .first<CustomerIdentity>();

    if (existing) {
      const [identity] = await client(trx)('customer_identities')
        .where({ id: existing.id })
        .update({
          updated_at: new Date(),
        })
        .returning<CustomerIdentity[]>('*');
      const customer = await this.findById(existing.customer_id, trx);
      if (!customer) {
        throw new Error('Customer identity points to missing customer');
      }
      return { customer, identity };
    }

    const [customer] = await client(trx)('customers')
      .insert({})
      .returning<Customer[]>('*');
    const [identity] = await client(trx)('customer_identities')
      .insert({
        customer_id: customer.id,
        provider: data.provider,
        provider_user_id: `hmac:${data.telegramUserIdHash}`,
        telegram_user_id_hmac: data.telegramUserIdHash,
        username: null,
        display_name: null,
      })
      .returning<CustomerIdentity[]>('*');

    return { customer, identity };
  }

  async recordConsent(
    customerId: string,
    provider: IdentityProvider,
    trx?: Knex.Transaction
  ): Promise<CustomerIdentity> {
    const [identity] = await client(trx)('customer_identities')
      .where({ customer_id: customerId, provider })
      .update({
        personal_data_consent_at: new Date(),
        personal_data_consent_revoked_at: null,
        updated_at: new Date(),
      })
      .returning<CustomerIdentity[]>('*');

    if (!identity) {
      throw new Error('Customer identity not found');
    }

    return identity;
  }

  async revokeConsent(customerId: string, provider: IdentityProvider, trx?: Knex.Transaction): Promise<void> {
    await client(trx)('customer_identities')
      .where({ customer_id: customerId, provider })
      .update({
        personal_data_consent_revoked_at: new Date(),
        updated_at: new Date(),
      });
  }

  async deleteIdentity(customerId: string, provider: IdentityProvider, trx?: Knex.Transaction): Promise<void> {
    await client(trx)('customer_identities')
      .where({ customer_id: customerId, provider })
      .delete();
  }

  async findActiveConsent(
    customerId: string,
    provider: IdentityProvider,
    trx?: Knex.Transaction
  ): Promise<CustomerIdentity | null> {
    const identity = await client(trx)('customer_identities')
      .where({ customer_id: customerId, provider })
      .whereNotNull('personal_data_consent_at')
      .whereNull('personal_data_consent_revoked_at')
      .first<CustomerIdentity>();

    return identity ?? null;
  }

  async findById(id: string, trx?: Knex.Transaction): Promise<Customer | null> {
    const customer = await client(trx)('customers').where({ id }).first<Customer>();
    return customer ?? null;
  }
}
