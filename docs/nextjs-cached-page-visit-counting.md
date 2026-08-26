# Counting visits to cached Next.js pages on Vercel

## Recommendation

For most applications, count a **browser page view**, not an SSR execution or raw HTTP request:

1. Use **Vercel Web Analytics and its API** for a managed page-view count over a timestamp-bounded window.
2. If the application needs immediate, application-owned event data, send a small **client-side beacon** on each page view and atomically increment time buckets in Redis or another analytics store.
3. Use Next.js `proxy.ts` only if the desired metric is an **edge request count**, including bots and requests that may never become a rendered page view.

Code in a prerendered or cached Server Component is not a valid per-visit counting point. Next.js can serve a static shell directly from the CDN without invoking that upstream code. An explicitly uncached component behind `<Suspense>` can run at request time, but it measures server/RSC requests rather than dependable browser page views.

## First define “visited”

These are different metrics:

| Metric | Counts cached delivery? | Also counts |
| --- | --- | --- |
| Browser page view | Yes | Direct loads and client navigations that execute JavaScript |
| Raw request to the page route | Yes, if measured before the cache | Bots, crawlers, and potentially prefetch/RSC traffic |
| Unique visitor | Yes | Requires an identity and a chosen deduplication window |
| SSR/render execution | No | Cache misses and regenerations, not visits |

The best default interpretation of “visited” is a browser page view. It maps to what a person actually loaded and avoids treating every framework request as another visit.

## Option 1: Vercel Web Analytics

Vercel Web Analytics tracks the first load as a page view and subsequent navigation through browser APIs. Because collection happens in the browser, an ISR/CDN cache hit still produces a page view. Vercel also filters traffic it identifies as automated from the User-Agent.

Use this when:

- a managed dashboard is sufficient;
- privacy-friendly, cookieless analytics and built-in bot filtering matter;
- delayed/aggregated analytics are acceptable.

For the stated one-hour requirement, the REST API supports:

- `since` and `until` as millisecond timestamps or valid date strings, including date and time;
- `filter=requestPath eq '/the/page'` for one exact pathname;
- a count endpoint that returns matching `pageviews` and `visitors`;
- aggregate time series grouped with `by=hour` when hourly buckets are useful.

A server-side request can therefore ask the count endpoint for `since=Date.now() - 3_600_000` and `until=Date.now()`. Keep the Vercel token server-side. The REST reference says bounds may be adjusted according to the desired granularity, and managed analytics can have ingestion delay, so validate boundary behavior and freshness if “exact to the second” is contractual.

## Option 2: Client beacon plus time-bucketed counter

This is usually the best fit for an application-owned, near-real-time rolling count.

### Flow

1. A small Client Component observes the pathname after the page is displayed.
2. It sends `POST /api/page-view` using `fetch(..., { keepalive: true })` or `navigator.sendBeacon()`.
3. The Route Handler validates the path and atomically increments a time bucket in Redis or another store.
4. A separate endpoint sums the buckets covering the requested interval.

The cached HTML/RSC payload can still include the Client Component. Its browser code executes after a cache hit, while only the beacon endpoint invokes a function.

### Window model

For a rolling 60-minute count, use minute buckets such as:

```text
pageviews:/products/widget:2026-04-15T14:37Z -> 12
```

Atomically increment the current bucket and give it a TTL slightly longer than the maximum query range. To query the last 60 minutes, sum the current minute and previous 59 buckets. Calendar-hour reporting can use one bucket per hour instead.

A sorted set of event timestamps gives more flexible windows, but minute counters use less storage and are usually enough.

### Important implementation details

- Count only once per committed navigation. React development Strict Mode can run effects more than once, so test a production build and optionally attach an event ID for idempotency.
- Decide whether reloads count. Standard page-view semantics count them.
- Validate and normalize pathnames server-side. Avoid accepting arbitrary high-cardinality keys.
- Use atomic increments. A read-modify-write sequence loses updates under concurrency.
- Exclude preview/development deployments if only production traffic should count.
- Use rate limiting or bot controls if the number is security-sensitive or affects ranking.

Tradeoffs:

- JavaScript-disabled clients, blocked beacons, and some privacy tools are not counted.
- A beacon measures displayed browser visits more accurately than raw requests, but it is not billing-grade or fraud-proof.
- Each view creates an ingest request unless events are sampled or batched.

## Option 3: `proxy.ts` before the CDN cache

On Next.js 16, Middleware has been renamed to Proxy. On Vercel, Routing Middleware runs before the cache, so a matched `proxy.ts` executes even when the eventual page response is a CDN/ISR hit. Next.js also documents `NextFetchEvent.waitUntil()` specifically for background analytics delivery.

Use this when the metric really means “requests reaching Vercel’s routing layer.” A typical implementation sends an event asynchronously:

```ts
// proxy.ts
import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server'

export function proxy(request: NextRequest, event: NextFetchEvent) {
  event.waitUntil(
    fetch(process.env.COUNTER_INGEST_URL!, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.COUNTER_TOKEN}` },
      body: JSON.stringify({ pathname: request.nextUrl.pathname }),
    })
  )

  return NextResponse.next()
}

export const config = {
  matcher: ['/products/:path*'],
}
```

This approach has substantial counting caveats:

- A Next.js visit can involve document, RSC, prefetch, and other framework requests.
- Client navigation may not issue a document request at all.
- Bots and crawlers count unless filtered.
- Next.js warns that Proxy runs for all matched requests. An unconstrained matcher also includes static files and image optimization.
- Every invocation and ingest write adds compute/cost. `waitUntil()` avoids blocking the response but does not make the work free.

Use a narrow matcher and explicitly test direct loads, reloads, client navigation, and prefetching. Proxy is reliable for request counting, but a client beacon is usually more reliable for page-view semantics.

## Option 4: Existing Vercel telemetry and drains

### Observability

Vercel Observability already records an edge request event for a cached request. This can answer operational questions in the dashboard without adding application code. It is an edge-request metric, not necessarily a human page-view metric, and the public documentation does not present it as an application-facing real-time counter API.

### Web Analytics Drain

A Web Analytics Drain exports individual page-view and custom events with timestamps to an external endpoint. Aggregate those events in a warehouse or time-series store for arbitrary one-hour windows. This preserves Web Analytics page-view semantics while allowing custom SQL and retention. Configure 100% sampling if the result must be a count rather than a sampled estimate.

### Log Drain

A Log Drain exports timestamped request/log data. It is suitable for raw request analysis, custom bot filtering, and long-term aggregation. It inherits the same “request is not necessarily a visit” caveat as Proxy. Configure 100% sampling and all relevant log sources before treating it as complete request coverage.

Drains are the strongest option when the organization already has an event pipeline or needs auditable, flexible reporting. They are more infrastructure than a simple counter.

## What not to use

- **A counter in prerendered/cached Server Component code or a cached page render:** it runs only when rendering occurs, so ISR/CDN hits are missed. An explicitly uncached streamed component can execute per server request, but still counts RSC/prefetch work rather than trustworthy browser views.
- **`instrumentation.ts`:** `register()` is process-start instrumentation, not a per-request hook.
- **An in-memory variable:** instances scale independently, restart, and do not provide atomic global state.
- **A cached count embedded in static HTML:** it becomes stale with the page. Fetch the displayed count client-side, or render it through an explicitly dynamic boundary if the extra server work is acceptable.

## Decision table

| Requirement | Best fit |
| --- | --- |
| Human-oriented page views over the last hour | Vercel Web Analytics API |
| Immediate application-owned rolling 60-minute page-view count | Client beacon + minute buckets |
| Every matched edge request, including cached hits and bots | `proxy.ts` + event store |
| No-code operational inspection | Vercel Observability |
| Arbitrary historical analytics in a warehouse | Analytics Drain or Log Drain |

## Suggested implementation

For this project, start with **Vercel Web Analytics**. Query its count endpoint server-side with `since`, `until`, and an exact `requestPath` filter. If its ingestion delay or boundary adjustment does not meet the product requirement, move to a **client beacon plus 60 minute buckets**. Both preserve ISR caching and have clear page-view semantics.

Do not synchronously update a database from `proxy.ts` for every request unless raw request counting is explicitly required.

## Primary sources

- Next.js installed documentation: [`Caching`](../node_modules/next/dist/docs/01-app/01-getting-started/08-caching.md), especially the statement that a static shell can be served directly from a CDN without the upstream server.
- Next.js installed documentation: [`Using a CDN with Next.js`](../node_modules/next/dist/docs/01-app/02-guides/cdn-caching.md), including that Proxy should run before the CDN cache.
- Next.js installed documentation: [`proxy.ts`](../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md), including execution order, matchers, and `waitUntil()`.
- [Vercel Web Analytics](https://vercel.com/docs/analytics), including browser page-view tracking and automated-traffic filtering.
- [Vercel Web Analytics API](https://vercel.com/docs/analytics/web-analytics-api), including count/aggregate query patterns and exact-path filters.
- Vercel REST API: [Counts page views](https://vercel.com/docs/rest-api/reference/endpoints/web-analytics/counts-page-views) and [Aggregates page views](https://vercel.com/docs/rest-api/reference/endpoints/web-analytics/aggregates-page-views), including timestamp bounds and hourly grouping.
- [Vercel Routing Middleware](https://vercel.com/docs/edge-middleware), including execution before the cache.
- [Vercel Observability](https://vercel.com/docs/observability), including edge request events for cached requests.
- [Vercel Web Analytics Drain](https://vercel.com/docs/drains/reference/analytics), including timestamped page-view event export.
- [Vercel Log Drain](https://vercel.com/docs/drains/reference/logs), including request and Proxy timestamps.
