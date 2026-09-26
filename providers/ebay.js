const API_ROOT = {
  production: 'https://api.ebay.com',
  sandbox: 'https://api.sandbox.ebay.com'
};
const EU_COUNTRIES = new Set(['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE']);
function displayCountry(code) {
  if (!code) return null;
  const normalized = code.toUpperCase();
  if (normalized === 'US') return 'USA';
  if (normalized === 'GB') return 'UK';
  if (normalized === 'IN') return 'India';
  return EU_COUNTRIES.has(normalized) ? 'EU' : normalized;
}

export function createEbayProvider(config, fetchImpl = fetch) {
  let tokenCache;
  const configured = Boolean(config.clientId && config.clientSecret);

  async function accessToken() {
    if (tokenCache && tokenCache.expiresAt > Date.now() + 30_000) return tokenCache.value;
    const root = API_ROOT[config.environment];
    const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const response = await fetchImpl(`${root}/identity/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Language': 'en-US'
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'https://api.ebay.com/oauth/api_scope' })
    });
    if (!response.ok) throw new Error(`eBay OAuth failed (${response.status})`);
    const data = await response.json();
    tokenCache = { value: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 7200) * 1000 };
    return tokenCache.value;
  }

  async function request(path) {
    const response = await fetchImpl(`${API_ROOT[config.environment]}${path}`, {
      headers: { Authorization: `Bearer ${await accessToken()}`, 'X-EBAY-MARKETPLACE-ID': config.marketplaceId }
    });
    if (!response.ok) throw new Error(`eBay API request failed (${response.status})`);
    return response.json();
  }

  function mapListing(item) {
    const shippingOption = item.shippingOptions?.find(option => option.shippingCost) || item.shippingOptions?.[0];
    const shipping = shippingOption?.shippingCost;
    const amount = Number(item.price?.value);
    const shippingAmount = shipping ? Number(shipping.value) : null;
    const earliestDelivery = shippingOption?.minEstimatedDeliveryDate ? new Date(shippingOption.minEstimatedDeliveryDate) : null;
    const latestDelivery = shippingOption?.maxEstimatedDeliveryDate ? new Date(shippingOption.maxEstimatedDeliveryDate) : null;
    const deliveryDays = earliestDelivery && Number.isFinite(earliestDelivery.getTime())
      ? Math.max(0, Math.ceil((earliestDelivery.getTime() - Date.now()) / 86_400_000)) : null;
    return {
      id: `ebay:${item.itemId}`,
      productName: item.title || null,
      brand: null,
      model: null,
      skuStyleCode: null,
      colorway: null,
      imageUrl: item.image?.imageUrl || item.thumbnailImages?.[0]?.imageUrl || null,
      listingUrl: item.itemWebUrl || null,
      marketplace: 'eBay',
      seller: item.seller?.username || null,
      country: displayCountry(item.itemLocation?.country),
      sourceType: 'Marketplace',
      currency: item.price?.currency || null,
      price: Number.isFinite(amount) ? amount : null,
      availableSizes: null,
      shipping: shippingAmount === null ? null : { amount: shippingAmount, currency: shipping.currency || item.price?.currency || null },
      estimatedDutiesTaxesInr: null,
      estimatedLandedInr: null,
      availability: item.buyingOptions?.length ? 'available' : 'unknown',
      deliveryEstimate: earliestDelivery && latestDelivery
        ? `${earliestDelivery.toISOString().slice(0, 10)} – ${latestDelivery.toISOString().slice(0, 10)}` : null,
      deliveryDays,
      dataMode: 'live',
      sizeAvailabilitySource: null
    };
  }

  return {
    name: 'eBay',
    get status() { return configured ? 'configured' : 'not_configured'; },
    async search({ q, limit = 50 }) {
      if (!configured) return { status: 'not_configured', listings: [] };
      const params = new URLSearchParams({ q, limit: String(limit) });
      const data = await request(`/buy/browse/v1/item_summary/search?${params}`);
      return { status: 'configured', listings: (data.itemSummaries || []).map(mapListing) };
    },
    async getProduct(id) {
      if (!configured) return { status: 'not_configured', listing: null };
      const itemId = id.replace(/^ebay:/, '');
      const item = await request(`/buy/browse/v1/item/${encodeURIComponent(itemId)}`);
      return { status: 'configured', listing: mapListing(item) };
    }
  };
}
