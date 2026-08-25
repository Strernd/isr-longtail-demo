# Cache Atelier

A Next.js 16.3 ecommerce demo for three product-delivery tiers with Cache Components and PPR.

| Tier | Count | Behavior |
| --- | ---: | --- |
| Super-top | 5 | Product pages are prerendered during `next build`. |
| On-demand | 5 | Cacheable after the first real request. Catalog links do not speculatively prefetch them. |
| Long-tail | 5 | Product data remains request-time and streams on every request. |

Header, footer, product-ranking data, and individual cacheable products each have cache tags. `/control` uses Server Actions with `updateTag()` to expire them.

## External ranking API

The demo fetches rankings from a public [GitHub Gist](https://gist.github.com/Strernd/0bed1c2b52eecfae6e141f8f51cf014f), intentionally acting as a tiny external JSON service:

```json
{
  "superTopSlugs": ["orbital-chair"],
  "onDemandSlugs": ["linen-coasters"]
}
```

[`getRanking()`](lib/ranking.ts) fetches the Gist raw URL with `cache: "no-store"` inside a `"use cache"` function. The `rankings` cache profile owns the 15-minute refresh policy and `products:top` tag.

- `generateStaticParams()` calls that shared function at build time to create the super-top prerenders.
- Product routes read the ranking cache at request time to choose super-top, on-demand, or long-tail behavior. Invalidating `products:top` lets the next product request re-evaluate that choice. Individual `product:<slug>` entries remain separately cached and tagged.

Set `RANKING_API_URL` in `.env.local`. [`.env.example`](.env.example) contains the public demo URL.

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
- `/api/products/:slug` for the fake product endpoint
- `/control` to invalidate header, footer, ranking, or a product tag

Read [the three-tier design](docs/top-vs-long-tail-cache-demo.md) and [the direct-visit versus client-navigation research](docs/first-visit-ppr-navigation-research.md) for the exact behavior and constraints.
