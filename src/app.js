import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProviders } from '../providers/index.js';
import { createRetailerProviders, retailerSources } from '../providers/retailers/index.js';
import { createApiRouter } from './routes/api.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export function createApp(config) {
  const app = express();
  const providers = createProviders(config);
  providers.retailers = createRetailerProviders();
  providers.retailerSources = retailerSources;
  app.disable('x-powered-by');
  app.use(express.json());
  app.use('/api', createApiRouter(providers, config));
  app.use(express.static(path.join(here, '..', 'public')));
  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'internal_error', message: 'The request could not be completed.' });
  });
  return { app, providers };
}
