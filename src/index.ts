import Fastify from 'fastify';
import { registerRoutes } from './api/routes.ts';
import { resolveApiListenOptions } from './api/server-config.ts';
import { ConfigurationService } from './configuration/configuration-service.ts';

const app = Fastify({ logger: true });
const configurationService = ConfigurationService.fromEnv();
const apiConfig = configurationService.getApiConfig();

const listenOptions = resolveApiListenOptions(apiConfig);

await registerRoutes(app);

try {
  await app.listen(listenOptions);
  console.log(`🚀 Server running at http://${listenOptions.host}:${listenOptions.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
