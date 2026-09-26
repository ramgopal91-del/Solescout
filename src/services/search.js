const normalize = value => String(value || '').trim().toLowerCase();

function passesFilters(listing, filters) {
  if (filters.brand && normalize(listing.brand) !== normalize(filters.brand)) return false;
  if (filters.country && normalize(listing.country) !== normalize(filters.country)) return false;
  if (filters.type && normalize(listing.sourceType) !== normalize(filters.type)) return false;
  if (filters.size) {
    if (!Array.isArray(listing.availableSizes)) return false;
    if (!listing.availableSizes.some(size => normalize(size) === normalize(filters.size))) return false;
  }
  return true;
}

function sortListings(listings, sort, query = '') {
  const copy = [...listings];
  if (sort === 'lowest_price') return copy.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  if (sort === 'fastest_delivery') return copy.sort((a, b) => (a.deliveryDays ?? Infinity) - (b.deliveryDays ?? Infinity));
  if (sort === 'name') return copy.sort((a, b) => (a.productName || '').localeCompare(b.productName || '', undefined, { sensitivity: 'base', numeric: true }));
  if (sort === 'relevance' && query.trim()) {
    const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    const score = listing => {
      const name = String(listing.productName || '').toLocaleLowerCase();
      const model = String(listing.model || '').toLocaleLowerCase();
      const brand = String(listing.brand || '').toLocaleLowerCase();
      const sku = String(listing.skuStyleCode || '').toLocaleLowerCase();
      return terms.reduce((total, term) => total
        + (name === term ? 100 : name.startsWith(term) ? 30 : name.includes(term) ? 20 : 0)
        + (model === term ? 15 : model.includes(term) ? 10 : 0)
        + (brand === term ? 12 : brand.includes(term) ? 8 : 0)
        + (sku.includes(term) ? 5 : 0), 0);
    };
    return copy.map((listing, index) => ({ listing, index, score: score(listing) }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(entry => entry.listing);
  }
  return copy.sort((a, b) => (a.estimatedLandedInr ?? Infinity) - (b.estimatedLandedInr ?? Infinity));
}

export async function searchListings(providers, config, filters) {
  const results = await Promise.all(providers.live.map(async provider => {
    if (provider.status === 'not_configured') return { provider: provider.name, status: 'not_configured', listings: [] };
    if (!filters.q?.trim()) return { provider: provider.name, status: 'not_searched', listings: [] };
    try {
      const result = await provider.search({ q: filters.q, limit: 50 });
      return { provider: provider.name, status: result.status, listings: result.listings };
    } catch (error) {
      return { provider: provider.name, status: 'error', listings: [], error: error.message };
    }
  }));

  const liveListings = results.flatMap(result => result.listings).filter(item => passesFilters(item, filters));
  const usingDemo = liveListings.length === 0 && config.demoFallback && providers.demo;
  const listings = usingDemo
    ? (await providers.demo.search({ q: filters.q })).listings.filter(item => passesFilters(item, { ...filters, size: null }))
    : liveListings;
  const filtered = listings.filter(item => passesFilters(item, filters));
  const providersStatus = usingDemo
    ? [...results, { provider: providers.demo.name, status: 'development_fallback', count: filtered.length }]
    : results.map(result => ({ provider: result.provider, status: result.status, count: result.listings.length, ...(result.error ? { error: result.error } : {}) }));
  const status = usingDemo ? 'development_fallback' : filtered.length ? 'ok' : results.every(result => result.status === 'not_configured') ? 'not_configured' : 'ok';
  return { query: filters.q, status, mode: usingDemo ? 'development_fallback' : 'live', providers: providersStatus, count: filtered.length, listings: sortListings(filtered, filters.sort, filters.q) };
}

export async function getListing(providers, id) {
  if (id.startsWith('demo:') && providers.demo) return providers.demo.getProduct(id);
  const [providerName, ...externalId] = id.split(':');
  const provider = providers.live.find(item => item.name.toLowerCase() === providerName.toLowerCase());
  if (!provider) return { status: 'not_found', listing: null };
  if (provider.status === 'not_configured') return { status: 'not_configured', listing: null };
  try { return await provider.getProduct(`${providerName}:${externalId.join(':')}`); }
  catch (error) { return { status: 'error', listing: null, error: error.message }; }
}
