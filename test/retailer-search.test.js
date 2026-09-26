import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesProductQuery, parseProductSitemap, queryWords, scoreCatalogEntry } from '../providers/retailers/shopify-sitemap.js';

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
  <url><loc>https://shop.example/products/dunk-low-retro</loc><image:image><image:title>Nike Dunk Low Retro</image:title></image:image></url>
  <url><loc>https://shop.example/products/samba-og</loc><image:image><image:title>adidas Samba OG</image:title></image:image></url>
  <url><loc>https://shop.example/products/9060-running-shoe</loc><image:image><image:title>New Balance 9060</image:title></image:image></url>
</urlset>`;

const indexedProducts = parseProductSitemap(sitemap, 'https://shop.example');

const cases = [
  { query: 'nike', handle: 'dunk-low-retro', title: 'Nike Dunk Low Retro', productName: 'Nike Dunk Low Retro', brand: 'NIKE' },
  { query: 'nike dunk', handle: 'dunk-low-retro', title: 'Nike Dunk Low Retro', productName: 'Dunk Low Retro', brand: 'Nike' },
  { query: 'dunk', handle: 'dunk-low-retro', title: 'Nike Dunk Low Retro', productName: 'Nike Dunk Low Retro', brand: 'Nike' },
  { query: 'adidas', handle: 'samba-og', title: 'adidas Samba OG', productName: 'Samba OG', brand: 'adidas' },
  { query: 'adidas samba', handle: 'samba-og', title: 'adidas Samba OG', productName: 'Samba OG', brand: 'adidas' },
  { query: 'new balance', handle: '9060-running-shoe', title: 'New Balance 9060', productName: '9060', brand: 'New Balance' }
];

for (const entry of cases) {
  test(`retailer search matches ${entry.query} across indexed product title and handle`, () => {
    const words = queryWords(entry.query);
    const indexed = indexedProducts.find(product => product.handle === entry.handle);

    assert.ok(indexed, `expected the sitemap entry for ${entry.handle}`);
    assert.ok(indexed.searchText.includes(entry.title));
    assert.ok(scoreCatalogEntry(indexed, words) >= 0, 'sitemap title/handle should select the product for lookup');
    assert.equal(matchesProductQuery([entry.productName, entry.brand], words), true, 'normalized product fields should retain the match');
  });
}

test('product sitemap parsing ignores unrelated origins and keeps decoded product titles', () => {
  const entries = parseProductSitemap(
    '<urlset><url><loc>https://other.example/products/nike-dunk</loc><image:title>Nike Dunk</image:title></url><url><loc>https://shop.example/products/nike-dunk</loc><image:title>Nike &amp; Dunk</image:title></url></urlset>',
    'https://shop.example'
  );
  assert.equal(entries.length, 1);
  assert.equal(entries[0].searchText, 'Nike & Dunk');
});

test('brand-only searches rank sneaker models ahead of matching accessories and collectibles', () => {
  const nikeQuery = queryWords('nike');
  const adidasQuery = queryWords('adidas');
  const nikeShoe = { handle: 'nike-dunk-low', searchText: 'Nike Dunk Low Retro' };
  const nikeLaces = { handle: 'nike-laces', searchText: 'Nike Shoelaces' };
  const nikeCharm = { handle: 'sneaker-charm-for-nike', searchText: 'Sneaker Charm for Nike' };
  const adidasShoe = { handle: 'adidas-samba-og', searchText: 'adidas Samba OG' };
  const adidasCollectible = { handle: 'adidas-messi-rings', searchText: 'Lionel Messi Rings Kith x Adidas' };

  assert.ok(scoreCatalogEntry(nikeShoe, nikeQuery) > scoreCatalogEntry(nikeLaces, nikeQuery));
  assert.ok(scoreCatalogEntry(nikeShoe, nikeQuery) > scoreCatalogEntry(nikeCharm, nikeQuery));
  assert.ok(scoreCatalogEntry(adidasShoe, adidasQuery) > scoreCatalogEntry(adidasCollectible, adidasQuery));
});
