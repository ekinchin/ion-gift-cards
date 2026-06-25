export function resolveApiPort(env: NodeJS.ProcessEnv) {
  return Number(env.PORT ?? 3000);
}
