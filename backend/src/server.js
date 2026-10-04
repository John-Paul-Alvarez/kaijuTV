import { createApp } from './app.js';

const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || (process.env.RENDER ? '0.0.0.0' : '127.0.0.1');
const origins = (process.env.FRONTEND_ORIGINS || 'http://127.0.0.1:5173,http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number.');
const server = createApp({ origins }).listen(port, host, () => console.info(`KaijuTV diagnostics listening on ${host}:${port}`));
server.requestTimeout = 35000;
server.headersTimeout = 10000;
for (const event of ['SIGTERM', 'SIGINT']) process.on(event, () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});
