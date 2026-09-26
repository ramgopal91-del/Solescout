import { createEbayProvider } from './ebay.js';
import { createStockxProvider } from './stockx.js';
import { demoProvider } from './demo.js';

export function createProviders(config) {
  const live = [createEbayProvider(config.ebay), createStockxProvider()];
  return { live, demo: config.demoFallback ? demoProvider : null };
}
