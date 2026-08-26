# Next.js 16.3.2 caching docs summary

**Source:** shipped Markdown under `node_modules/next/dist/docs` in this project (reviewed as the 16.3.2 docs). Relative paths below are from that directory.

## Executive summary

- `cacheComponents: true` enables Cache Components: `use cache`, `cacheLife`, and `cacheTag`; data is dynamic unless explicitly cached, and Next.js produces a static HTML/App Shell with dynamic content streamed separately.
- Put `cacheTag()` in the `use cache` scope whose result should be invalidated. `revalidateTag(tag, 'max')` is the normal stale-while-revalidate choice; `updateTag(tag)` is the Server Action/read-your-own-writes choice that makes the next request block for fresh data.
- The docs explicitly recommend data-level caching to make a source reusable and independent of UI/pages. They do **not** explicitly document that a tag declared by a nested `use cache` automatically propagates to the parent cache entry.
- Nested `cacheLife` behavior is asymmetric: an explicit outer lifetime wins; an omitted outer lifetime uses `default`, and shorter inner lifetimes can clamp/reduce it while longer inner lifetimes cannot extend it beyond `default`. An unintentional nested short-lived cache without an explicit outer lifetime is a prerendering error.

## Requested findings

### (a) Tag propagation from nested `use cache` scopes

The docs establish these facts:

1. A tag is attached by calling `cacheTag()` inside a cached function/component. `revalidateTag()` then invalidates “all cache entries with that tag.” (`01-app/02-guides/how-revalidation-works.md`)
2. A page-level cache includes nested imported components in its output: **“Any components imported and nested in `page` file are part of the cache output associated with the `page`.”** (`01-app/03-api-reference/01-directives/use-cache.md`)
3. Layouts and pages with `use cache` are separate entries: **“Each of these segments are treated as separate entry points in your application, and will be cached independently.”** (`01-app/03-api-reference/01-directives/use-cache.md`)
4. The `cacheTag` reference says to tag “your cached data” in the relevant cached function/component, and its examples invalidate that tag across readers. (`01-app/03-api-reference/04-functions/cacheTag.md`)

**Conclusion / limitation:** these docs describe output nesting and independent cache entries, but do not state that a tag declared in an inner cached function is copied/propagated onto every enclosing `use cache` entry or page cache. Do not infer automatic tag propagation from the statement that nested output is part of a parent’s output. If a parent/page cache is itself a separately cached entry and must respond directly to a tag invalidation, the docs provide no explicit guarantee that the child’s `cacheTag()` covers it; tag the intended cache scope explicitly (or cache the data source separately and have pages read it).

### (b) `revalidateTag(profile)` versus `updateTag`

`revalidateTag` now takes a second argument:

```ts
revalidateTag(tag: string, profile: string | { expire?: number }): void
```

The recommended form is `revalidateTag('posts', 'max')`. The docs promise:

> **“The tag entry is marked as stale”** and the next visit uses **“stale-while-revalidate semantics.”** (`01-app/03-api-reference/04-functions/revalidateTag.md`)

That means stale content is served immediately while fresh data is fetched in the background. It is lazy: **“fresh data is only fetched when pages using that tag are next visited”**; calling it does not fan out into immediate revalidations. (`01-app/03-api-reference/04-functions/revalidateTag.md`)

A custom cache-life profile can be supplied for custom behavior. The legacy one-argument form is deprecated: it expires the tag immediately and the next request performs a blocking revalidation/cache miss. `{ expire: 0 }` is documented for external webhooks that require immediate expiration. (`01-app/03-api-reference/04-functions/revalidateTag.md`)

`updateTag` is only callable from a Server Action and is for read-your-own-writes. The key promise is:

> **“`updateTag` immediately expires the cached data for the specified tag. The next request will wait to fetch fresh data rather than serving stale content from the cache.”** (`01-app/03-api-reference/04-functions/updateTag.md`)

In short:

| API | Availability | Next read | Intended use |
|---|---|---|---|
| `updateTag('x')` | Server Actions only | Blocks for fresh data; no stale response | User mutation must immediately show its own write |
| `revalidateTag('x', 'max')` | Server Functions and Route Handlers | Serves stale value, refreshes in background on next visit | Content where a short delay is acceptable; webhooks/background-friendly invalidation |
| `revalidateTag('x')` | Deprecated | Immediate expiry/blocking behavior | Migrate to `updateTag` or a profiled `revalidateTag` |

### (c) Decoupling a cached data source from pages

Yes. The getting-started caching guide explicitly documents data-level caching:

> **“Data-level caching is useful when the same data is used across multiple components, or when you want to cache the data independently from the UI.”** (`01-app/01-getting-started/08-caching.md`)

The documented pattern is an independently cached function:

```tsx
async function getUsers() {
  'use cache'
  cacheLife('hours')
  return db.query('SELECT * FROM users')
}
```

Pages/components call `getUsers()` rather than owning the data cache. Add `cacheTag('users')` in that function when it needs on-demand invalidation, then call `revalidateTag('users', 'max')` or `updateTag('users')` as appropriate. The same guide calls this “cache the data independently from the UI.” (`01-app/01-getting-started/08-caching.md`)

The `use cache` reference also says cached functions can cache a network request, database query, or slow computation, and the docs recommend explicit `cacheLife` in every scope. (`01-app/03-api-reference/01-directives/use-cache.md`)

### (d) Nested `cacheLife` propagation/clamping

The dedicated “Nested caching behavior” section is explicit (`01-app/03-api-reference/04-functions/cacheLife.md`):

- **Explicit outer `cacheLife`:** the outer cache uses its own lifetime **“regardless of inner cache lifetimes.”** An explicit outer lifetime **“always takes precedence, whether it's longer or shorter than inner lifetimes.”** The outer hit returns the complete output, including nested data.
- **No explicit outer `cacheLife`:** the outer uses the `default` profile (documented defaults: 5-minute client `stale`, 15-minute server `revalidate`, never-expiring `expire`). Inner caches with shorter lifetimes can reduce the outer default lifetime; inner caches with longer lifetimes cannot extend it beyond default.
- **Short-lived nested cache:** a short-lived inner cache (`revalidate: 0` or `expire` under 5 minutes) nested inside an outer `use cache` without an explicit lifetime causes Next.js to throw during prerendering, because propagation would silently make the outer cache short-lived. Add an explicit outer `cacheLife()` to make the choice intentional.

The docs recommend explicit lifetimes because otherwise behavior depends on nested caches and is harder to reason about. (`01-app/03-api-reference/04-functions/cacheLife.md`)

## API/config notes

- `cacheTag` requires `cacheComponents: true`; one call accepts up to 128 tags, with a 256-character limit per tag. (`01-app/03-api-reference/04-functions/cacheTag.md`)
- `cacheLife` must run inside a cache directive scope; it cannot run at module scope. Presets define `stale` (client), `revalidate` (background server refresh), and `expire` (synchronous regeneration after no traffic). (`01-app/03-api-reference/04-functions/cacheLife.md`)
- `cacheComponents` also makes Partial Prerendering the default App Router behavior. (`01-app/03-api-reference/05-config/01-next-config-js/cacheComponents.md`)
- `partialPrefetching: true` requires `cacheComponents: true` and prefetches one reusable App Shell per route rather than a full per-link render. URL-specific params/search data and runtime data can be resolved later or through runtime prefetching. (`01-app/03-api-reference/05-config/01-next-config-js/partialPrefetching.md`; `01-app/02-guides/adopting-partial-prefetching.md`)
- With partial prefetching, the App Shell includes static content and cached content that does not depend on the URL; `<Link prefetch={true}>` opts into fetching additional per-link runtime data. (`01-app/02-guides/adopting-partial-prefetching.md`)

## Practical recommendation

For a shared source read by multiple pages, use a dedicated `use cache` function with an explicit `cacheLife` and `cacheTag`. In a Server Action after a user mutation, use `updateTag` for immediate read-your-own-writes. In a Route Handler/webhook or when stale content is acceptable, use `revalidateTag(tag, 'max')` for lazy SWR. If a page itself is separately cached and must be invalidated as an entry, explicitly consider/tag that cache scope; the reviewed docs do not promise automatic propagation of inner tags to parent caches.
