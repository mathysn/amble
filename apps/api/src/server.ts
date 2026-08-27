import { buildApp } from './app.js';
import { config } from './config.js';

const app = buildApp();

app
  .listen({ port: config.PORT, host: config.HOST })
  .then((addr) => app.log.info(`Amble API listening on ${addr}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
