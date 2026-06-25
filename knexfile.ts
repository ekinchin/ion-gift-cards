import type { Knex } from 'knex';

export function resolvePoolConfig(env: NodeJS.ProcessEnv) {
  return {
    min: Number(env.DB_POOL_MIN ?? 0),
    max: Number(env.DB_POOL_MAX ?? 2),
  };
}

const config: Knex.Config = {
  client: 'pg',
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'ion_gift_card',
  },
  pool: resolvePoolConfig(process.env),
};

export default config;
