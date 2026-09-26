const normalize = value => String(value || '').trim().toLowerCase();

function passesFilters(listing, filters) {
  if (filters.brand && normalize(listing.brand) !== normalize(filters.brand)) return false;
  if (filters.country && normalize(listing.country) !== normalize(filters.country)) return false;
  if (filters.type && normalize(listing.sourceType) !== normalize(filters.type)) return false;
  if (filters.marketplace && normalize(listing.marketplace) !== normalize(filters.marketplace)
    && normalize(listing.provider) !== normalize(filters.marketplace)) return false;
  if (filters.size) {
    const confirmed = Array.isArray(listing.availableSizes) ? listing.availableSizes : [];
    const reported = Array.isArray(listing.reportedSizes) ? listing.reportedSizes
      : Array.isArray(listing.sizes) ? listing.sizes : [];
    const sizeLabels = [...confirmed, ...reported.map(size => typeof size === 'object' ? size.label : size)];
    if (!sizeLabels.some(size => normalize(size) === normalize(filters.size))) return false;
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
  const sourceProviders = [...providers.live, ...(providers.retailers || [])];
  const retailerIds = new Set((providers.retailers || []).map(provider => provider.id));
  const page = Math.max(0, Number.parseInt(filters.page, 10) || 0);
  const results = await Promise.all(sourceProviders.map(async provider => {
    if (provider.status === 'not_configured') return { provider: provider.name, status: 'not_configured', listings: [] };
    if (!filters.q?.trim() && !retailerIds.has(provider.id)) return { provider: provider.name, status: 'not_searched', listings: [] };
    try {
      const result = retailerIds.has(provider.id)
        ? await provider.search({ q: filters.q, brand: filters.brand, limit: 6, offset: page * 6 })
        : page === 0 ? await provider.search({ q: filters.q, limit: 50 }) : { status: 'live', listings: [], hasMore: false };
      return { provider: provider.name, status: result.status, listings: result.listings, hasMore: Boolean(result.hasMore), ...(result.partial ? { partial: true } : {}), ...(result.error ? { error: result.error } : {}) };
    } catch (error) {
      return { provider: provider.name, status: 'error', listings: [], error: error.message };
    }
  }));

  const liveListings = results.flatMap(result => result.listings).filter(item => passesFilters(item, filters));
  const usingDemo = liveListings.length === 0 && page === 0 && config.demoFallback && providers.demo;
  const listings = usingDemo
    ? (await providers.demo.search({ q: filters.q })).listings.filter(item => passesFilters(item, { ...filters, size: null }))
    : liveListings;
  const filtered = listings.filter(item => passesFilters(item, filters));
  const providersStatus = usingDemo
    ? [...results, { provider: providers.demo.name, status: 'development_fallback', count: filtered.length }]
    : results.map(result => ({ provider: result.provider, status: result.status, count: result.listings.length, ...(result.partial ? { partial: true } : {}), ...(result.error ? { error: result.error } : {}) }));
  const status = usingDemo ? 'development_fallback' : filtered.length ? 'ok' : results.every(result => result.status === 'not_configured') ? 'not_configured' : 'ok';
  const hasMore = !usingDemo && results.some(result => result.hasMore);
  return { query: filters.q, page, pageSize: usingDemo ? filtered.length : 12, hasMore, status, mode: usingDemo ? 'development_fallback' : 'live', providers: providersStatus, count: filtered.length, listings: sortListings(filtered, filters.sort, filters.q) };
}

export async function getListing(providers, id) {
  if (id.startsWith('demo:') && providers.demo) return providers.demo.getProduct(id);
  const [providerName, ...externalId] = id.split(':');
  const retailer = providers.retailers?.find(item => item.id === providerName.toLowerCase());
  if (retailer) {
    try { return await retailer.getProduct(id); }
    catch (error) { return { status: 'error', listing: null, error: error.message }; }
  }
  const provider = providers.live.find(item => item.name.toLowerCase() === providerName.toLowerCase());
  if (!provider) return { status: 'not_found', listing: null };
  if (provider.status === 'not_configured') return { status: 'not_configured', listing: null };
  try { return await provider.getProduct(`${providerName}:${externalId.join(':')}`); }
  catch (error) { return { status: 'error', listing: null, error: error.message }; }
}
