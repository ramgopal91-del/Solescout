/**
 * Common live retailer product/offer shape. Fields that a source omits stay
 * null; `sizes` contains reported variants and is not a stock assertion.
 * @typedef {Object} RetailerProductOffer
 * @property {string} provider
 * @property {string} merchant
 * @property {string} productName
 * @property {?string} brand
 * @property {?string} model
 * @property {?string} skuStyleCode
 * @property {?string} gtin
 * @property {?string} colorway
 * @property {?string} imageUrl
 * @property {?string} productUrl
 * @property {?number} price
 * @property {?string} currency
 * @property {'merchant'|'inferred'|null} currencySource
 * @property {?string} currencyInference
 * @property {?number} salePrice
 * @property {?string} availability
 * @property {?Array<Object>} sizes
 * @property {?Array<Object>} reportedSizes
 * @property {?Array<string>} availableSizes Only sizes with source-confirmed availability.
 * @property {?Object} shipping
 * @property {string} sourceType
 * @property {string} dataMode
 */
const nullableFields = [
  'brand', 'model', 'skuStyleCode', 'gtin', 'colorway', 'imageUrl', 'price', 'currency',
  'salePrice', 'regularPrice', 'availability', 'sizes', 'availableSizes', 'shipping',
  'deliveryEstimate', 'estimatedDutiesTaxesInr', 'estimatedLandedInr', 'country', 'seller',
  'imageUrls', 'sourceProductId', 'sourceProductHandle', 'reportedSizes', 'currencySource',
  'currencyInference'
];

export function normalizeRetailerOffer(fields) {
  const normalized = { ...fields };
  for (const field of nullableFields) {
    if (!Object.hasOwn(normalized, field)) normalized[field] = null;
  }
  return normalized;
}
