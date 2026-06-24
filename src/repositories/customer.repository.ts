import { db } from '../db/knex.ts';
import type { Knex } from 'knex';
import type { Customer, CustomerIdentity, IdentityProvider } from '../types/index.ts';

function client(trx?: Knex.Transaction) {
  return trx ?? db;
}

export interface ResolveIdentityData {
  provider: IdentityProvider;
  providerUserId: string;
  username?: string;
  displayName?: string;
}

export interface ResolvedCustomerIdentity {
  customer: Customer;
  identity: CustomerIdentity;
}

export class CustomerRepository {
  async resolveOrCreateIdentity(
    data: ResolveIdentityData,
    trx?: Knex.Transaction
  ): Promise<ResolvedCustomerIdentity> {
    const existing = await client(trx)('customer_identities')
      .where({
        provider: data.provider,
        provider_user_id: data.providerUserId,
      })
      .first<CustomerIdentity>();

    if (existing) {
      const [identity] = await client(trx)('customer_identities')
        .where({ id: existing.id })
        .update({
          username: data.username ?? null,
          display_name: data.displayName ?? null,
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
        provider_user_id: data.providerUserId,
        username: data.username ?? null,
        display_name: data.displayName ?? null,
      })
      .returning<CustomerIdentity[]>('*');

    return { customer, identity };
  }

  async findById(id: string, trx?: Knex.Transaction): Promise<Customer | null> {
    const customer = await client(trx)('customers').where({ id }).first<Customer>();
    return customer ?? null;
  }
}
