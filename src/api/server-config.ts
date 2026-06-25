import type { ApiConfig } from '../configuration/configuration-service.ts';

export function resolveApiListenOptions(config: ApiConfig) {
  return {
    host: config.host,
    port: config.port,
  };
}
