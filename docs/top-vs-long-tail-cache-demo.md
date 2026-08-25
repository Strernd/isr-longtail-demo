# Product caching: three delivery tiers

## Goal

This ecommerce demo uses one dynamic product route with three deliberately different behaviors:

| Tier | Products | Product output | Catalog-link policy |
| --- | --- | --- | --- |
| Super-top | Orbital Chair through Loft Speaker | Concrete product pages and their cached detail are prerendered at build time. | `prefetch={true}` is safe because the work already exists at build time. |
| On-demand | Linen Coasters through Wool Desk Mat | Cacheable after a real product request. They are omitted from `generateStaticParams()`. | `prefetch={false}` prevents every visible catalog card from triggering an on-demand upgrade. |
| Long-tail | Brass Paper Clip through Walnut Monitor Block | Product detail is request-time only and always streams. | `prefetch={false}` prevents speculative work. |

## Build prerendering

`app/products/[slug]/page.tsx` obtains the super-top slugs from [`getRanking()`](../lib/ranking.ts) in `generateStaticParams()`. That function fetches the public Gist ranking API with a 15-minute tagged cache lifetime. At build time, Next knows each returned slug and executes the cacheable product branch. The build output therefore contains a concrete static page for each super-top product. Changing that build set later requires a redeploy.

The route still keeps the `params` read inside `<Suspense>`. That produces the generic App Shell needed for URLs not in the build.

## On-demand and long-tail behavior

The second tier uses `getCachedProduct(slug)`, a `"use cache"` function tagged `product:<slug>`. A direct request to an omitted slug receives PPR’s generic document shell, then Next upgrades that concrete URL in the background. A later request can use its cached concrete output.

The third tier calls `getFreshLongTailProduct(slug)`, which calls `connection()` and has no cache directive. It always remains behind the Suspense fallback. Next may retain a route artifact with that fallback, but it cannot produce a fully cached product page.

## Why the on-demand cards disable prefetch

With Cache Components, a prefetch to an unlisted dynamic URL counts as its first visit and starts the background upgrade. A catalog that renders all product links would otherwise warm every on-demand product whether anyone clicks it or not.

This demo uses `prefetch={false}` for the on-demand and long-tail tiers. It guarantees that their cache work happens only after an actual request. The trade-off is specific to **client-side** navigation: no destination RSC payload exists before the click, so the client router waits for the first server response before committing the transition.

A **direct document visit** is different. PPR can send its static App Shell HTML immediately and stream the product detail without any client prefetch. See [first-visit PPR navigation research](first-visit-ppr-navigation-research.md) for the complete distinction.

## Tags

| Tag | Cached scope | Control action |
| --- | --- | --- |
| `chrome:header` | Header component | Invalidate header |
| `chrome:footer` | Footer component | Invalidate footer |
| `products:top` | Top-tier source and `/api/top-products` | Invalidate top-products |
| `product:<slug>` | One super-top or on-demand product detail | Invalidate product |

The control page uses `updateTag()` in Server Actions. The next matching cached read is therefore blocking and fresh. This differs from `revalidateTag(tag, "max")`, which uses stale-while-revalidate behavior.

## Fake endpoints and timing

- External ranking API: the public [product-rankings Gist](https://gist.github.com/Strernd/0bed1c2b52eecfae6e141f8f51cf014f) is fetched through `RANKING_API_URL`. It returns `superTopSlugs` and `onDemandSlugs`.
- `GET /api/top-products`: exposes the same cached external ranking response. `getRanking()` uses `cache: "no-store"` inside a `"use cache"` scope, refreshes through the 15-minute `rankings` profile, and has the `products:top` tag. The build path calls the shared source directly rather than HTTP-fetching its own route, so it works during `next build`. Product routes do not depend on the ranking cache, so its refresh cannot invalidate individual product routes.
- `GET /api/products/:slug`: returns the tier and selected detail data. Cacheable detail takes 1.6 seconds on a cache fill. Long-tail detail waits 1.6 seconds on every request.

Server Components call shared data functions directly. The Route Handlers exist as observable fake endpoints, not as an internal data transport.

## How to observe it

1. Run production mode: `npm run build && NEXT_PRIVATE_DEBUG_CACHE=1 npm start`.
2. Inspect the build output. It lists the five `superTopProducts` routes as static (`○`).
3. Open an on-demand URL directly, for example `/products/linen-coasters`. Its first document request gets the PPR shell and starts the route upgrade. Reload after it completes to observe the cached result.
4. Open a long-tail URL, for example `/products/brass-clip`, repeatedly. Its `fresh request` timestamp changes every time.
5. Use `/control` to invalidate chrome, ranking, or an individual cacheable product tag, then reload the relevant route.

## Production constraint

The cache mutation controls intentionally have no authentication so this small demo can show `updateTag()`. A production revalidation action or endpoint must authenticate and authorize callers.
