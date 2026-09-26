import { Router } from 'express';
import { getListing, searchListings } from '../services/search.js';

export function createApiRouter(providers, config) {
  const router = Router();
  router.get('/health', (_req, res) => res.json({ status: 'ok', providers: providers.live.map(provider => ({ name: provider.name, status: provider.status })), demoFallback: Boolean(providers.demo) }));
  router.get('/search', async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      const result = await searchListings(providers, config, {
        q, brand: req.query.brand || '', size: req.query.size || '', country: req.query.country || '',
        type: req.query.type || '', sort: req.query.sort || 'lowest_landed'
      });
      res.json(result);
    } catch (error) { next(error); }
  });
  router.get('/products/:id', async (req, res) => {
    const result = await getListing(providers, req.params.id);
    if (result.status === 'not_found') return res.status(404).json({ error: 'not_found', id: req.params.id });
    if (result.status === 'not_configured') return res.status(503).json({ status: result.status, id: req.params.id });
    if (result.status === 'error') return res.status(502).json({ status: result.status, message: result.error });
    res.json(result);
  });
  return router;
}
