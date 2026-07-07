import type { Knex } from 'knex';
import { ConfigurationService, type DatabaseConfig } from './src/configuration/configuration-service.ts';

export function createKnexConfig(databaseConfig: DatabaseConfig): Knex.Config {
  const connection: Knex.PgConnectionConfig = {
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.user,
    password: databaseConfig.password,
    database: databaseConfig.name,
    keepAlive: true,
    keepAliveInitialDelayMillis: 1000,
    connectionTimeoutMillis: 5000,
  };

  if (databaseConfig.ssl) {
    connection.ssl = {
      rejectUnauthorized: false,
    };
  }

  return {
    client: 'pg',
    connection,
    searchPath: [databaseConfig.schema],
    pool: {
      ...databaseConfig.pool,
      idleTimeoutMillis: 5000,
      reapIntervalMillis: 1000,
      acquireTimeoutMillis: 10000,
      createTimeoutMillis: 10000,
      destroyTimeoutMillis: 5000,
      createRetryIntervalMillis: 200,
    },
  };
}

const config = createKnexConfig(ConfigurationService.fromEnv().getDatabaseConfig());

export default config;
