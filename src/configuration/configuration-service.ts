import { z } from 'zod';

const optionalString = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().min(1).optional()
);

const requiredString = z.preprocess(
  (value) => value === '' ? undefined : value,
  z.string().min(1)
);

const portSchema = z.coerce.number().int().min(1).max(65535);
const poolSizeSchema = z.coerce.number().int().min(0);
const booleanStringSchema = z.preprocess(
  (value) => value === '' || value === undefined ? 'false' : value,
  z.enum(['true', 'false'])
    .transform((value) => value === 'true')
);
const receiptModeSchema = z.preprocess(
  (value) => value === '' || value === undefined ? 'soft' : value,
  z.enum(['soft', 'required'])
);
const receiptProviderSchema = z.preprocess(
  (value) => value === '' || value === undefined ? 'none' : value,
  z.enum(['none', 'fns', 'ofd'])
);
const receiptOnlineVerificationSchema = z.preprocess(
  (value) => value === '' || value === undefined ? 'disabled' : value,
  z.enum(['disabled', 'enabled'])
);
const receiptAllowedInnsSchema = z.preprocess(
  (value) => typeof value === 'string'
    ? value.split(',').map((item) => item.trim()).filter(Boolean)
    : [],
  z.array(z.string().min(1))
);
const positiveIntegerSchema = z.coerce.number().int().min(1);

export const configurationSchema = z.object({
  api: z.object({
    host: requiredString.default('0.0.0.0'),
    port: portSchema.default(3000),
  }),
  database: z.object({
    host: requiredString.default('localhost'),
    port: portSchema.default(5432),
    user: requiredString.default('postgres'),
    password: requiredString.default('postgres'),
    name: requiredString.default('ion_gift_card'),
    ssl: booleanStringSchema,
    pool: z.object({
      min: poolSizeSchema.default(0),
      max: poolSizeSchema.default(2),
    }),
  }).superRefine((database, ctx) => {
    if (database.pool.min > database.pool.max) {
      ctx.addIssue({
        code: 'custom',
        path: ['pool', 'min'],
        message: 'DB_POOL_MIN must be less than or equal to DB_POOL_MAX',
      });
    }
  }),
  telegram: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('polling'),
      botToken: requiredString,
      webAppUrl: optionalString,
    }),
    z.object({
      mode: z.literal('webhook'),
      botToken: requiredString,
      webhookSecret: requiredString,
      webAppUrl: optionalString,
    }),
  ]),
  receipt: z.object({
    mode: receiptModeSchema,
    allowedInns: receiptAllowedInnsSchema,
    maxAgeMinutes: positiveIntegerSchema.default(60),
    onlineVerification: receiptOnlineVerificationSchema,
    provider: receiptProviderSchema,
  }),
});

export type AppConfig = z.infer<typeof configurationSchema>;
export type ApiConfig = AppConfig['api'];
export type DatabaseConfig = AppConfig['database'];
export type TelegramConfig = AppConfig['telegram'];
export type ReceiptConfig = AppConfig['receipt'];

type Env = NodeJS.ProcessEnv;

const envNamesByPath = new Map<string, string>([
  ['api.host', 'API_HOST'],
  ['api.port', 'PORT'],
  ['database.host', 'DB_HOST'],
  ['database.port', 'DB_PORT'],
  ['database.user', 'DB_USER'],
  ['database.password', 'DB_PASSWORD'],
  ['database.name', 'DB_NAME'],
  ['database.ssl', 'DB_SSL'],
  ['database.pool.min', 'DB_POOL_MIN'],
  ['database.pool.max', 'DB_POOL_MAX'],
  ['telegram.mode', 'TELEGRAM_MODE'],
  ['telegram.botToken', 'TELEGRAM_BOT_TOKEN'],
  ['telegram.webAppUrl', 'WEB_APP_URL'],
  ['telegram.webhookSecret', 'TELEGRAM_WEBHOOK_SECRET'],
  ['receipt.mode', 'RECEIPT_MODE'],
  ['receipt.allowedInns', 'RECEIPT_ALLOWED_INNS'],
  ['receipt.maxAgeMinutes', 'RECEIPT_MAX_AGE_MINUTES'],
  ['receipt.onlineVerification', 'RECEIPT_ONLINE_VERIFICATION'],
  ['receipt.provider', 'RECEIPT_PROVIDER'],
]);

function formatConfigError(error: z.ZodError, pathPrefix?: string) {
  const messages = error.issues.map((issue) => {
    const path = issue.path.join('.');
    const fullPath = pathPrefix && path ? `${pathPrefix}.${path}` : pathPrefix ?? path;
    const envName = envNamesByPath.get(fullPath) ?? fullPath;
    return `${envName}: ${issue.message}`;
  });

  return new Error(`Invalid configuration: ${messages.join('; ')}`);
}

function parseConfig<T>(schema: z.ZodType<T>, value: unknown, pathPrefix?: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw formatConfigError(result.error, pathPrefix);
  }
  return result.data;
}

function buildApiConfig(env: Env): unknown {
  return {
    host: env.API_HOST,
    port: env.PORT,
  };
}

function buildDatabaseConfig(env: Env): unknown {
  return {
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    name: env.DB_NAME,
    ssl: env.DB_SSL,
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
    },
  };
}

function buildTelegramConfig(env: Env): unknown {
  return {
    mode: env.TELEGRAM_MODE,
    botToken: env.TELEGRAM_BOT_TOKEN,
    ...(env.TELEGRAM_WEBHOOK_SECRET !== undefined ? { webhookSecret: env.TELEGRAM_WEBHOOK_SECRET } : {}),
    ...(env.WEB_APP_URL !== undefined ? { webAppUrl: env.WEB_APP_URL } : {}),
  };
}

function buildReceiptConfig(env: Env): unknown {
  return {
    mode: env.RECEIPT_MODE,
    allowedInns: env.RECEIPT_ALLOWED_INNS,
    maxAgeMinutes: env.RECEIPT_MAX_AGE_MINUTES,
    onlineVerification: env.RECEIPT_ONLINE_VERIFICATION,
    provider: env.RECEIPT_PROVIDER,
  };
}

export class ConfigurationService {
  private readonly env: Env;

  private constructor(env: Env) {
    this.env = env;
  }

  static fromEnv(env: Env = process.env) {
    return new ConfigurationService(env);
  }

  getConfig(): AppConfig {
    return parseConfig(configurationSchema, {
      api: buildApiConfig(this.env),
      database: buildDatabaseConfig(this.env),
      telegram: buildTelegramConfig(this.env),
      receipt: buildReceiptConfig(this.env),
    });
  }

  getApiConfig(): ApiConfig {
    return parseConfig(configurationSchema.shape.api, buildApiConfig(this.env), 'api');
  }

  getDatabaseConfig(): DatabaseConfig {
    return parseConfig(configurationSchema.shape.database, buildDatabaseConfig(this.env), 'database');
  }

  getTelegramConfig(): TelegramConfig {
    return parseConfig(configurationSchema.shape.telegram, buildTelegramConfig(this.env), 'telegram');
  }

  getReceiptConfig(): ReceiptConfig {
    return parseConfig(configurationSchema.shape.receipt, buildReceiptConfig(this.env), 'receipt');
  }
}
