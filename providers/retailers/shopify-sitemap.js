import { normalizeRetailerOffer } from './contract.js';

const SITEMAP_TTL_MS = 6 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PRODUCT_LOOKUPS = 6;
const sitemapCache = new Map();
const SNEAKER_TERMS = new Set([
  'sneaker', 'sneakers', 'shoe', 'shoes', 'trainer', 'trainers', 'footwear', 'dunk', 'jordan', 'air', 'force',
  'blazer', 'vomero', 'pegasus', 'samba', 'gazelle', 'campus', 'spezial', 'yeezy', 'ultraboost', 'superstar',
  'forum', '9060', '550', '574', '990', '991', '992', '993', '2002r', '1906', 'gel', 'asics', 'speedcat',
  'palermo', 'salomon', 'xt', 'reebok', 'club', 'vans', 'converse', 'chuck'
]);
const NON_FOOTWEAR_TERMS = new Set([
  'lace', 'laces', 'shoelace', 'shoelaces', 'apparel', 'shirt', 'shirts', 'tee', 'hoodie', 'hoodies', 'sock',
  'socks', 'keychain', 'keychains', 'collectible', 'collectibles', 'toy', 'toys', 'ring', 'rings', 'wallet',
  'bag', 'bags', 'accessory', 'accessories', 'figure', 'figures', 'lego', 'charm', 'charms', 'jewelry', 'jewellery'
]);

function decodeXml(value) {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function locations(xml) {
  return [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)].map(match => decodeXml(match[1].trim()));
}

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { Accept: 'application/xml,text/xml,application/json' } });
  if (!response.ok) {
    const error = new Error(`Merchant source returned HTTP ${response.status}.`);
    error.httpStatus = response.status;
    throw error;
  }
  return response.text();
}

async function withConcurrency(items, concurrency, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = await task(items[index]); }
      catch (error) { results[index] = { error }; }
    }
  }));
  return results;
}

async function loadProductCatalog(sitemapUrl, baseUrl) {
  const cached = sitemapCache.get(sitemapUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.products;
  const indexXml = await fetchText(sitemapUrl);
  const children = locations(indexXml).filter(url => /\/sitemap_products_\d+\.xml(?:\?|$)/i.test(url));
  if (!children.length) throw new Error('The documented sitemap contained no product sitemap entries.');
  const childResults = await withConcurrency(children, 4, async url => parseProductSitemap(await fetchText(url), baseUrl));
  const products = [...new Map(childResults.flatMap(value => Array.isArray(value) ? value : [])
    .map(product => [product.handle, product])).values()];
  if (!products.length) {
    const failed = childResults.filter(value => value?.error).length;
    throw new Error(failed ? `Unable to read product sitemap entries (${failed} sitemap requests failed).` : 'No product URLs were provided by the documented sitemap.');
  }
  sitemapCache.set(sitemapUrl, { products, expiresAt: Date.now() + SITEMAP_TTL_MS });
  return products;
}

function handleFromUrl(url, baseUrl) {
  const parsed = new URL(url);
  if (parsed.origin !== new URL(baseUrl).origin) return null;
  return parsed.pathname.match(/^\/products\/([^/]+)\/?$/)?.[1] || null;
}

export function parseProductSitemap(xml, baseUrl) {
  return [...xml.matchAll(/<url\b[^>]*>([\s\S]*?)<\/url>/gi)].flatMap(match => {
    const block = match[1];
    const location = block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i)?.[1];
    if (!location) return [];
    const url = decodeXml(location.trim());
    const handle = handleFromUrl(url, baseUrl);
    if (!handle) return [];
    const titles = [...block.matchAll(/<image:title>\s*([\s\S]*?)\s*<\/image:title>/gi)].map(item => decodeXml(item[1].trim()));
    const captions = [...block.matchAll(/<image:caption>\s*([\s\S]*?)\s*<\/image:caption>/gi)].map(item => decodeXml(item[1].trim()));
    return [{ url, handle, searchText: [...titles, ...captions].join(' ') }];
  });
}

export function queryWords(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 1 || /^\d+$/.test(word));
}

export function scoreCatalogEntry(entry, words) {
  const handleTokens = queryWords(entry.handle || '');
  const titleTokens = queryWords(entry.searchText || '');
  const allTokens = new Set([...handleTokens, ...titleTokens]);
  if (!words.length) {
    const footwearSignal = [...allTokens].filter(token => SNEAKER_TERMS.has(token)).length;
    const nonFootwearSignal = [...allTokens].filter(token => NON_FOOTWEAR_TERMS.has(token)).length;
    return footwearSignal > 0 && nonFootwearSignal === 0 ? footwearSignal * 35 : -1;
  }
  if (!words.every(word => [...allTokens].some(token => token === word || token.startsWith(word)))) return -1;

  const handleMatches = words.filter(word => handleTokens.some(token => token === word || token.startsWith(word))).length;
  const titleMatches = words.filter(word => titleTokens.some(token => token === word || token.startsWith(word))).length;
  const phrase = words.join(' ');
  const titleText = titleTokens.join(' ');
  const handleText = handleTokens.join(' ');
  const signals = new Set([...titleTokens, ...handleTokens]);
  const footwearSignal = [...signals].filter(token => SNEAKER_TERMS.has(token)).length;
  const nonFootwearSignal = [...signals].filter(token => NON_FOOTWEAR_TERMS.has(token)).length;
  return words.length * 10 + handleMatches * 12 + titleMatches * 24
    + (titleText.includes(phrase) || handleText.includes(phrase) ? 100 : 0)
    + Math.min(footwearSignal, 3) * 35 - Math.min(nonFootwearSignal, 3) * 90;
}

export function matchesProductQuery(fields, words) {
  const tokens = queryWords((Array.isArray(fields) ? fields : [fields]).filter(Boolean).join(' '));
  return words.every(word => tokens.some(token => token === word || token.startsWith(word)));
}

function numberOrNull(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceGtin(value) {
  if (value == null) return null;
  const digits = String(value).replace(/[\s-]/g, '');
  return /^(\d{8}|\d{12}|\d{13}|\d{14})$/.test(digits) ? digits : null;
}

function commonVariantField(variants, field) {
  const values = [...new Set(variants.map(variant => variant[field]).filter(Boolean).map(String))];
  return values.length === 1 ? values[0] : null;
}

function optionAt(variant, option) {
  return variant[`option${option.position}`] ?? null;
}

function getSize(variant, options) {
  const sizeOption = options.find(option => /size|footwear\s*size/i.test(String(option?.name || '')));
  const value = sizeOption ? optionAt(variant, sizeOption) : null;
  if (value) return String(value);
  const values = [variant.option1, variant.option2, variant.option3, variant.title]
    .filter(Boolean).map(String);
  const found = values.flatMap(text => text.match(/\b(?:UK|US|EU|EUR)\s*\d+(?:\.\d+)?\b/gi) || [])[0];
  return found || null;
}

function getColorway(variant, options) {
  const colorOption = options.find(option => /colou?r|colorway/i.test(String(option?.name || '')));
  return colorOption ? optionAt(variant, colorOption) : null;
}

function normalizeProduct(product, { id, name, baseUrl }) {
  if (!product || !product.id || !product.handle || !product.title || !Array.isArray(product.variants)) return null;
  const category = `${product.product_type || ''} ${Array.isArray(product.tags) ? product.tags.join(' ') : product.tags || ''}`;
  if (!/shoe|sneaker|footwear|trainer/i.test(category)) return { ignoredNonFootwear: true };
  const options = Array.isArray(product.options) ? product.options : [];
  const variants = product.variants.map(variant => {
    const price = numberOrNull(variant.price);
    const compareAt = numberOrNull(variant.compare_at_price);
    return {
      id: variant.id == null ? null : String(variant.id),
      size: getSize(variant, options),
      skuStyleCode: variant.sku || null,
      gtin: sourceGtin(variant.barcode),
      price,
      currency: variant.price_currency || variant.compare_at_price_currency || variant.currency || null,
      currencySource: variant.price_currency || variant.compare_at_price_currency || variant.currency ? 'merchant' : 'inferred',
      currencyInference: variant.price_currency || variant.compare_at_price_currency || variant.currency ? null : 'INR inferred from the India merchant storefront and its published INR pricing context',
      salePrice: price != null && compareAt != null && compareAt > price ? price : null,
      regularPrice: compareAt,
      availability: null
    };
  });
  const pricedVariants = variants.filter(variant => variant.price != null);
  const cheapest = pricedVariants.reduce((current, variant) => !current || variant.price < current.price ? variant : current, null);
  const currencyWasSupplied = cheapest?.currencySource === 'merchant';
  const imageUrls = (Array.isArray(product.images) ? product.images : []).map(image => image?.src).filter(Boolean);
  const colorway = variants.map(variant => {
    const sourceVariant = product.variants.find(item => String(item.id) === variant.id);
    return sourceVariant ? getColorway(sourceVariant, options) : null;
  }).find(Boolean) || null;
  const productUrl = `${baseUrl}/products/${encodeURIComponent(product.handle)}`;
  const reportedSizes = variants.filter(variant => variant.size).map(variant => ({ label: variant.size, availability: null, price: variant.price, salePrice: variant.salePrice, currency: variant.currency || 'INR', currencySource: variant.currencySource, currencyInference: variant.currencyInference, skuStyleCode: variant.skuStyleCode, gtin: variant.gtin }));
  return normalizeRetailerOffer({
    id: `${id}:${product.handle}`,
    provider: id,
    merchant: name,
    productName: product.title,
    brand: product.vendor || null,
    model: null,
    skuStyleCode: commonVariantField(variants, 'skuStyleCode'),
    gtin: commonVariantField(variants, 'gtin'),
    colorway,
    imageUrl: imageUrls[0] || null,
    imageUrls,
    listingUrl: productUrl,
    productUrl,
    marketplace: name,
    seller: null,
    currency: cheapest?.currency || 'INR',
    currencySource: cheapest?.currencySource || 'inferred',
    currencyInference: currencyWasSupplied ? null : 'INR inferred from the India merchant storefront and its published INR pricing context',
    price: cheapest?.price ?? null,
    salePrice: cheapest?.salePrice ?? null,
    regularPrice: cheapest?.regularPrice ?? null,
    sizes: reportedSizes,
    reportedSizes,
    availableSizes: null,
    shipping: null,
    deliveryEstimate: null,
    estimatedDutiesTaxesInr: null,
    estimatedLandedInr: null,
    availability: null,
    sourceType: 'Retail',
    country: 'India',
    dataMode: 'live',
    isLive: true,
    sourceProductId: String(product.id),
    sourceProductHandle: product.handle
  });
}

async function loadProduct(handle, config) {
  const productUrl = `${config.baseUrl}/products/${encodeURIComponent(handle)}.json`;
  const response = await fetch(productUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), headers: { Accept: 'application/json' } });
  if (!response.ok) {
    const error = new Error(`Merchant product source returned HTTP ${response.status}.`);
    error.httpStatus = response.status;
    throw error;
  }
  const payload = await response.json();
  return normalizeProduct(payload?.product, config);
}

export function createShopifySitemapRetailer(config) {
  return {
    ...config,
    status: 'live',
    sourceType: 'retailer',
    async search({ q, brand = '', limit = MAX_PRODUCT_LOOKUPS, offset = 0 }) {
      const words = queryWords([q, brand].filter(Boolean).join(' '));
      const products = await loadProductCatalog(config.sitemapUrl, config.baseUrl);
      const matches = products
        .map(item => ({ ...item, score: scoreCatalogEntry(item, words) }))
        .filter(item => item.score >= 0)
        .sort((a, b) => b.score - a.score || a.handle.localeCompare(b.handle))
      const pageOffset = Math.max(0, Number.parseInt(offset, 10) || 0);
      const pageLimit = Math.min(MAX_PRODUCT_LOOKUPS, Math.max(1, Number.parseInt(limit, 10) || MAX_PRODUCT_LOOKUPS));
      const pageMatches = matches.slice(pageOffset, pageOffset + pageLimit);
      const loaded = await withConcurrency(pageMatches, 4, async item => {
        const product = await loadProduct(item.handle, config);
        return product || { error: new Error('Merchant product JSON did not contain a valid product record.') };
      });
      const listings = loaded.filter(item => item && !item.error && !item.ignoredNonFootwear)
        .filter(item => matchesProductQuery([item.productName, item.brand, item.model, item.skuStyleCode], words));
      const failedCount = loaded.filter(item => item?.error).length;
      return {
        status: 'live', listings, hasMore: pageOffset + pageMatches.length < matches.length, partial: failedCount > 0,
        error: failedCount ? `${failedCount} merchant product detail request(s) failed or returned malformed data.` : null,
        errorCount: failedCount
      };
    },
    async getProduct(id) {
      const handle = String(id).split(':').slice(1).join(':');
      if (!handle || !/^[a-z0-9-]+$/i.test(handle)) return { status: 'not_found', listing: null };
      const listing = await loadProduct(handle, config);
      return { status: listing ? 'live' : 'not_found', listing };
    }
  };
}
