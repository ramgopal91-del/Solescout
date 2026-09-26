# Direct retailer sources

Retailer connectors are separate from sneaker marketplaces. Their normalized records keep a distinct record for each merchant product handle, link to that merchant product page, and only set fields present in the documented source.

## Implemented sources

Crepdog Crew and The Mainstreet Marketplace explicitly document unauthenticated, read-only product discovery through `/sitemap.xml` and product JSON at `/products/{handle}.json` in their `/agents.md` documents. The connector reads only the published XML sitemap and JSON product resources; it does not parse storefront HTML, invoke checkout, or use private endpoints.

The sitemap supplies exact product handles. Product JSON supplies product ID/title/vendor, images, options, and variants with prices, currency, SKU/barcode fields, and size labels. Product identity uses the individual product ID and handle so separate colors/SKUs are not merged.

Their current product JSON responses do **not** include variant `available`, inventory quantity, or stock fields. Size labels are returned as `reportedSizes` (and retained in the compatible `sizes` field) with `availability: null`; `availableSizes` remains null. The size filter may match a reported variant, but the UI labels it as reported with availability unknown. SoleScout does not claim any size is in stock. Shipping, delivery estimates, model, and product-level style code are also left unset when absent. Currency is marked `merchant` when the product source supplies it; otherwise INR is explicitly marked as inferred from the India merchant context. No landed INR estimate is calculated because no per-product shipping data is supplied.

The first uncached search reads sitemap index entries and product sitemap URLs with bounded concurrency. Sitemap URLs are cached in memory for six hours; current prices and product details are fetched from the documented product JSON resource for each returned result.

## Search and source status

- `GET /api/retailers` lists the capability review for all seven merchants.
- `GET /api/retailers/search?q=Nike%20Air%20Force%201` searches the implemented retailers.
- Add `&provider=crepdogcrew` or `&provider=mainstreet` to query one connector.
- Normal `GET /api/search?q=...` also combines live retailer listings with existing marketplace results. The demo fallback remains explicitly marked and is used only when no live listing is returned.

Results identify `provider`, `merchant`, `sourceType: "Retail"`, and `dataMode: "live"`. A listing's Buy/View Listing link is its merchant product page, not the store homepage.

## Capability review

| Merchant | Public machine-readable source | Authentication | Product images | Price | Sizes | Stock | Product URL | India fulfillment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Nike India | No usable catalog feed confirmed; terms restrict automated collection | — | — | — | — | — | — | Yes |
| adidas India | HTML category sitemap only; terms restrict automated collection | — | — | — | — | — | — | Yes |
| Foot Locker India | robots.txt advertises XML sitemap; current sitemap request returned 403 | None documented | Not verified | Not verified | Not verified | Not verified | Not verified | Yes |
| Superkicks | Public Shopify sitemap; terms prohibit automated search and collection/use of listings and prices | None for sitemap | Listed in public catalog but not used | Listed in public catalog but not used | Not verified | Not verified | Listed in public catalog but not used | Yes |
| VegNonVeg | Public XML product sitemap contains product URLs and image metadata; no documented product JSON/feed | None for sitemap | Yes, sitemap image URLs | No | No | No | Yes, sitemap URLs | Yes |
| Crepdog Crew | Documented `/sitemap.xml` + `/products/{handle}.json` read-only source | None | Yes | Yes, INR | Variant size labels; stock status absent | Not supplied | Yes | Yes |
| The Mainstreet Marketplace | Documented `/sitemap.xml` + `/products/{handle}.json` read-only source | None | Yes | Yes, INR | Variant size labels; stock status absent | Not supplied | Yes | Yes |

Sources that restrict automated content use are intentionally not connected. VegNonVeg's sitemap is machine-readable, but it lacks price and inventory, and a connector returning buyable offers would require an undocumented source or parsing product pages. Foot Locker's sitemap was inaccessible at the time of review. Neither limitation is filled with guessed data.
