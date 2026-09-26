# SoleScout

SoleScout is a sneaker sourcing MVP for comparing marketplace listings for delivery to India. Its frontend is a static page served by an Express application. The browser receives listing data through the backend API; marketplace credentials remain server-side.

## Install and run

Requirements: Node.js 20 or newer and npm.

```sh
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell, copy the environment template with `Copy-Item .env.example .env`. Edit `.env` locally to add credentials. Start without watch mode using `npm start`. Open <http://localhost:3000>.

No `.env` file is included in the repository. Never commit provider credentials.

## Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP server port | `3000` |
| `NODE_ENV` | Runtime environment; production disables demo fallback | `development` |
| `EBAY_CLIENT_ID` | eBay OAuth application client ID | unset |
| `EBAY_CLIENT_SECRET` | eBay OAuth application client secret | unset |
| `EBAY_ENVIRONMENT` | eBay API environment: `production` or `sandbox` | `production` |
| `EBAY_MARKETPLACE_ID` | Marketplace passed to the Browse API | `EBAY_US` |
| `DEMO_FALLBACK` | Set to `true` to show explicitly labeled generated development samples when live search returns no results | `false` |

The demo fallback is only enabled outside production. It is never represented as live inventory, and it does not assert size availability. It uses sample prices and assumptions for UI development only.

## API

- `GET /api/health` reports the configured status of providers.
- `GET /api/search?q=...` searches providers. Omit `q` to browse the live retailer catalog. Results are paginated at 12 per page with the `page` parameter (zero-based). Optional filters include `brand`, `size`, `country`, `type`, and `marketplace`; `sort` supports `relevance`, `name`, `lowest_price`, `lowest_landed`, and `fastest_delivery`.
- `GET /api/retailers` reports the retailer capability review; `GET /api/retailers/search?q=...` tests retailer sources directly.
- `GET /api/products/:id` fetches a listing by provider-prefixed ID, such as `ebay:<item-id>`.

Listing records share a normalized shape: product name, brand/model/style/colorway, image and listing URLs, marketplace, seller, country/source type, currency and price, provider-reported sizes, shipping, estimated duties/taxes and landed INR cost, availability, and data mode. Fields the provider does not supply or that the app cannot reliably calculate are `null`; they are not inferred as facts. In particular, this MVP does not yet calculate live FX, duties, or INR landed costs for eBay listings.

## Provider architecture and current status

`src/routes/api.js` exposes API routes. `src/services/search.js` coordinates providers, filters and sorts normalized listings. `providers/index.js` registers providers. Individual provider modules implement a shared `search`/`getProduct` shape.

- **eBay Browse API:** Implemented with server-side client-credentials OAuth. It is `not_configured` until both `EBAY_CLIENT_ID` and `EBAY_CLIENT_SECRET` are set. The integration requests listing summaries and individual item details. It does not invent size, brand, shipping, or landed-cost data.
- **StockX:** Adapter placeholder; reports `not_configured` and returns no listings.
- **Direct retailers:** Crepdog Crew and The Mainstreet Marketplace are connected through their documented public sitemap and product JSON sources. Browse/search returns live product records, with direct product-page links, actual source images and prices. Results are paginated; size variants are reported by the merchant, while stock availability remains unknown. See [providers/retailers/README.md](providers/retailers/README.md) for source details and limitations.
- **Development fallback:** Optional generated sample catalog enabled only by `DEMO_FALLBACK=true` in a non-production environment. The UI displays a prominent warning and marks each sample.

Provider responses may be live, empty, unconfigured, or error. Empty provider searches do not imply that a product is unavailable in the marketplace.

## Adding a marketplace provider

1. Add a module under `providers/` implementing `name`, `status`, `search({ q, limit })`, and `getProduct(id)`.
2. Read credentials from environment variables through `src/config.js`; add variable names (never secret values) to `.env.example` and document them here.
3. Convert upstream records to the shared listing shape. Preserve provider currency and only populate fields the provider actually returns or a documented calculator can derive.
4. Register the provider in `providers/index.js` and include its configuration status in `/api/health`.
5. Handle upstream authentication, rate limits, and errors without returning fabricated listings.
