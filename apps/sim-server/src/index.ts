import { startSimServer } from './server.ts';

const env = process.env;
const numberFrom = (value: string | undefined): number | undefined => {
  if (value === undefined || value === '') return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const server = await startSimServer({
  port: numberFrom(env.PORT) ?? 8787,
  seed: numberFrom(env.SEED),
  incidentRate: numberFrom(env.INCIDENT_RATE),
  allowInject: env.ALLOW_INJECT !== 'false',
  allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  log: (msg) => console.log(`[sim-server] ${msg}`),
});

const shutdown = async (signal: string) => {
  console.log(`[sim-server] ${signal} received, shutting down`);
  await server.close();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
