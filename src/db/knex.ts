import knex from 'knex';
import { createKnexConfig } from '../../knexfile.ts';
import { ConfigurationService } from '../configuration/configuration-service.ts';

const configurationService = ConfigurationService.fromEnv();

export const db = knex(createKnexConfig(configurationService.getDatabaseConfig()));
