import { Router } from 'express';
import { getListing, searchListings } from '../services/search.js';

export function createApiRouter(providers, config) {
  const router = Router();
  router.get('/health', (_req, res) => res.json({
    status: 'ok',
    providers: providers.live.map(provider => ({ name: provider.name, status: provider.status })),
    demoFallback: Boolean(providers.demo),
    retailers: (providers.retailers || []).map(provider => ({ name: provider.name, id: provider.id, status: provider.status, sourceType: 'retailer' }))
  }));
  router.get('/retailers', (_req, res) => res.json({ retailers: (providers.retailerSources || []).map(source => ({ ...source })) }));
  router.get('/retailers/search', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const selected = String(req.query.provider || '').trim().toLowerCase();
    if (!q) return res.status(400).json({ error: 'missing_query', message: 'Provide q to search retailer catalogs.' });
    const available = providers.retailers || [];
    if (selected && !available.some(provider => provider.id === selected)) {
      return res.status(400).json({ error: 'unknown_retailer_provider', provider: selected });
    }
    const targets = selected ? available.filter(provider => provider.id === selected) : available;
    const results = await Promise.all(targets.map(async provider => {
      try {
        const result = await provider.search({ q, limit: 20 });
        return { provider: provider.id, merchant: provider.name, live: result.status === 'live', status: result.status, httpStatus: 200, count: result.listings.length, partial: Boolean(result.partial), error: result.error || null, errorCount: result.errorCount || 0, listings: result.listings };
      } catch (error) {
        return { provider: provider.id, merchant: provider.name, live: false, status: 'error', httpStatus: error.httpStatus ?? null, count: 0, error: error.message, listings: [] };
      }
    }));
    res.json({ query: q, sourceType: 'retailer', results });
  });
  router.get('/search', async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      const result = await searchListings(providers, config, {
        q, brand: req.query.brand || '', size: req.query.size || '', country: req.query.country || '',
        type: req.query.type || '', marketplace: req.query.marketplace || '',
        sort: req.query.sort || 'lowest_landed', page: req.query.page || 0
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
