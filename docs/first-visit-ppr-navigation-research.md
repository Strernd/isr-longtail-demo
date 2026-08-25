# First-visit PPR and client navigation

## Answer

An unknown product URL can show a PPR App Shell immediately on its **first direct visit**, without client prefetch. This is not the same transport path as a client-side `<Link prefetch={false}>` navigation.

## Direct visit: shell first, no prefetch required

With `cacheComponents: true`, Next.js creates a static shell with static/cached content and Suspense fallbacks. On a document request, the server/CDN can send that HTML shell immediately, then stream the URL-specific content into its fallbacks.

For dynamic params that are not in `generateStaticParams`, Next.js serves the reusable App Shell immediately and upgrades the concrete URL in the background. The Next.js 16.3 ISR guide explicitly states that this works for URLs not included in the build. It also says the App Shell for unlisted params is served from Next.js 16.3.

Required shape:

```tsx
export default function ProductPage(props: PageProps<'/products/[slug]'>) {
  return (
    <>
      <StaticProductChrome />
      <Suspense fallback={<ProductSkeleton />}>
        <ProductData params={props.params} />
      </Suspense>
    </>
  )
}

async function ProductData({ params }: { params: PageProps<'/products/[slug]'>['params'] }) {
  const { slug } = await params
  // cached or uncached reads, depending on the intended tier
}
```

The page/layout must not await `params` above the boundary. The shell can contain chrome and fallbacks; URL-specific product work belongs below `<Suspense>`.

## Client `<Link prefetch={false}>`: no instant transition

A client navigation fetches only an RSC component payload, not a fresh HTML document. If `prefetch={false}`, the browser has no destination App Shell payload before the click. It therefore cannot commit the destination page until the post-click server response arrives.

This is why a hard refresh/address-bar visit can paint the PPR shell immediately, while an in-app click with prefetch disabled appears to wait.

## Client navigation policy

| Policy | Speculative work before click | First client click |
| --- | --- | --- |
| Hard/direct visit | None | PPR HTML shell can paint immediately, product streams later |
| `<Link prefetch={false}>` | None | Waits for destination RSC response before transition can commit |
| Default `<Link>` with Partial Prefetching | One shared App Shell per route | Shell can commit immediately; URL-specific product work streams |
| `<Link prefetch={true}>` | Runtime prefetch per link | Shell plus URL-specific cacheable product work can be ready before click |

A prefetch to an unlisted dynamic URL counts as its first visit and starts its background upgrade. Therefore, default prefetch cannot guarantee that an on-demand-cacheable product remains untouched until a real click.

## Implication for the three-tier demo

1. **Build top 5:** `generateStaticParams` contains those slugs. They are concrete prerenders at build time.
2. **On-demand top 5:** cacheable product reads, omitted from `generateStaticParams`. A hard/direct visit gets the generic App Shell then triggers an upgrade. A catalog link can either prefetch the shell (better client UX, but may start the upgrade) or disable prefetch (no speculative upgrade, but client click waits for a server response).
3. **Long-tail 5:** uncached product reads behind `<Suspense>`. Direct visits get the App Shell; detail streams per request. An upgraded route can retain only its fallback, never fully cached product content.

This is a framework trade-off, not a missing configuration: without a prefetched/visited RSC payload, an SPA transition cannot render the destination shell before its first server round trip. PPR solves the equivalent direct-document request path.

## Primary sources

- Installed Next.js 16.3.2: [`Incremental Static Regeneration with Cache Components`](../node_modules/next/dist/docs/01-app/02-guides/incremental-static-regeneration-cache-components.md), especially “At runtime”.
- Installed Next.js 16.3.2: [`Instant navigation`](../node_modules/next/dist/docs/01-app/02-guides/instant-navigation.md), especially “What instant means” and “A page that navigates instantly”.
- Installed Next.js 16.3.2: [`Caching`](../node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md), “Prerendering” and “Incremental Static Regeneration”.
- Installed Next.js 16.3.2: [`Streaming`](../node_modules/next/dist/docs/01-app/02-guides/streaming.md), “The static shell”.
- Official article: [Building App-like Experiences with Next.js 16.3](https://nextjs.org/blog/building-app-like-experiences-with-nextjs-16-3).
