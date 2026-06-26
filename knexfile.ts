import type { Knex } from 'knex';
import { ConfigurationService, type DatabaseConfig } from './src/configuration/configuration-service.ts';

export function createKnexConfig(databaseConfig: DatabaseConfig): Knex.Config {
  const connection: Knex.PgConnectionConfig = {
    host: databaseConfig.host,
    port: databaseConfig.port,
    user: databaseConfig.user,
    password: databaseConfig.password,
    database: databaseConfig.name,
  };

  if (databaseConfig.ssl) {
    connection.ssl = {
      rejectUnauthorized: false,
    };
  }

  return {
    client: 'pg',
    connection,
    pool: databaseConfig.pool,
  };
}

const config = createKnexConfig(ConfigurationService.fromEnv().getDatabaseConfig());

export default config;
