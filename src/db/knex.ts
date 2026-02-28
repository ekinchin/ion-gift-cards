import knex from 'knex';
import config from '../../knexfile.ts';

export const db = knex(config);
