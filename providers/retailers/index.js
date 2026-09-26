import { createShopifySitemapRetailer } from './shopify-sitemap.js';

// Retailer sources are kept separate from marketplace providers. Entries without
// a documented, usable public product source intentionally have no connector.
export const retailerSources = [
  { id: 'nike-india', name: 'Nike India', status: 'not_configured', publicSource: 'Official India terms only; no usable public catalog feed documented', authentication: 'No public feed confirmed', indiaFulfillment: 'yes', reason: 'Nike India terms prohibit automated data collection from the site.' },
  { id: 'adidas-india', name: 'adidas India', status: 'not_configured', publicSource: 'HTML category sitemap; no usable product feed confirmed', authentication: 'No public feed confirmed', indiaFulfillment: 'yes', reason: 'adidas terms prohibit automated collection from the platform.' },
  { id: 'foot-locker-india', name: 'Foot Locker India', status: 'not_configured', publicSource: 'robots.txt advertises a sitemap; sitemap returned HTTP 403', authentication: 'No public feed confirmed', indiaFulfillment: 'yes', reason: 'The advertised sitemap was inaccessible (403); no other documented machine-readable catalog source was found.' },
  { id: 'superkicks', name: 'Superkicks', status: 'not_configured', publicSource: 'Shopify product sitemap', authentication: 'Sitemap is public', indiaFulfillment: 'yes', reason: 'Superkicks terms prohibit collection and commercial use of product listings, descriptions, and prices, and prohibit automated search tools.' },
  { id: 'vegnonveg', name: 'VegNonVeg', status: 'not_configured', publicSource: 'robots.txt advertises public XML product sitemaps', authentication: 'Sitemap is public', indiaFulfillment: 'yes', reason: 'The sitemap exposes discovery metadata only; no documented product JSON/feed provides live price and inventory. A usable connector would require parsing storefront pages.' },
  { id: 'crepdogcrew', name: 'Crepdog Crew', status: 'live', publicSource: 'https://crepdogcrew.com/agents.md → /sitemap.xml and /products/{handle}.json', authentication: 'None', indiaFulfillment: 'yes', reason: null },
  { id: 'mainstreet', name: 'The Mainstreet Marketplace', status: 'live', publicSource: 'https://marketplace.mainstreet.co.in/agents.md → /sitemap.xml and /products/{handle}.json', authentication: 'None', indiaFulfillment: 'yes', reason: null }
];

export function createRetailerProviders() {
  return [
    createShopifySitemapRetailer({
      id: 'crepdogcrew', name: 'Crepdog Crew', baseUrl: 'https://crepdogcrew.com',
      sitemapUrl: 'https://crepdogcrew.com/sitemap.xml'
    }),
    createShopifySitemapRetailer({
      id: 'mainstreet', name: 'The Mainstreet Marketplace', baseUrl: 'https://marketplace.mainstreet.co.in',
      sitemapUrl: 'https://marketplace.mainstreet.co.in/sitemap.xml'
    })
  ];
}
