# Cache Atelier

A Next.js 16.3 ecommerce demo for three product-delivery tiers with Cache Components and PPR.

| Tier | Count | Behavior |
| --- | ---: | --- |
| Super-top | 5 | Product pages are prerendered during `next build`. |
| On-demand | 5 | Cacheable after the first real request. Catalog links do not speculatively prefetch them. |
| Long-tail | 5 | Product data remains request-time and streams on every request. |

Header, footer, top-product ranking, and individual cacheable products each have cache tags. `/control` uses Server Actions with `updateTag()` to expire them.

## Optional ranking endpoint

Set `TOP_PRODUCTS_ENDPOINT` to use a real ranking service. Its JSON response must contain known catalog slugs:

```json
{
  "superTopSlugs": ["orbital-chair"],
  "onDemandSlugs": ["linen-coasters"]
}
```

[`getTopProducts()`](lib/products.ts) caches that response for 15 minutes using the `rankings` cache profile and the `products:top` tag. It uses a `no-store` fetch inside the `"use cache"` boundary so the function's cache lifetime is the only refresh policy. The ranking supplies `generateStaticParams()` at build time and powers `/api/top-products`; changing the built super-top set requires a redeploy. Product delivery tiers intentionally remain independent, so a ranking refresh does not invalidate every product cache. Copy [`.env.example`](.env.example) to `.env.local` to configure it. Leave it unset to retain the local fake ranking.

## Run it

```bash
npm run build
NEXT_PRIVATE_DEBUG_CACHE=1 npm start
```

Open:

- `/` for the fifteen-product catalog
- `/products/orbital-chair` for a super-top build prerender
- `/products/linen-coasters` for an on-demand cacheable product
- `/products/brass-clip` for an always-streaming long-tail product
- `/api/top-products` and `/api/products/:slug` for fake endpoints
- `/control` to invalidate header, footer, ranking, or a product tag

Read [the three-tier design](docs/top-vs-long-tail-cache-demo.md) and [the direct-visit versus client-navigation research](docs/first-visit-ppr-navigation-research.md) for the exact behavior and constraints.
