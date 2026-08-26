# `use cache` tag and lifetime propagation (Next.js `v16.3.1-canary.25`)

**Source examined:** `next.js` commit `e2fb664ceb129115a72071405d5e6aa14ddfc841` (`v16.3.1-canary.25-3-ge2fb664ceb`), cache-components implementation.  
**Scope:** App Router, public `'use cache'`, including cache hits and modern prerender/static-shell flow.

## Short answers

1. **Yes.** A public outer `'use cache'` entry receives the inner entry's tag set (along with its lifetime metadata). Consequently, an invalidation of an inner tag makes an already-created outer entry discardable too, because that tag is now in the outer entry's `tags` array. This is transitive through any number of nested public cache scopes.
2. **Min wins unless the enclosing `'use cache'` sets its own explicit `cacheLife()`.** Inner `stale`, `revalidate`, and `expire` clamp the enclosing accumulator. When the outer cache has no explicit life, that produces a min-wins outer entry. An explicit outer `cacheLife()` takes precedence for that outer entry. A page/prerender store has no such explicit override, so an included cache read clamps the static route artifact's ISR `revalidate` (and its `expire`/client stale metadata).
3. A page that is not itself cached uses its `PrerenderStore` as the outer accumulator. A cache read is first filled/read through the Resume Data Cache (RDC); after the entry is determined eligible for the final prerender, its metadata is propagated to that store. The render result copies the store's tags/lifetimes into route metadata: tags become `fetchTags` / `x-next-cache-tags`, and `revalidate` becomes route cache control.
4. **No supported mechanism exists to include data from an inner cached read in an enclosing cache/artifact while suppressing that read's tags or lifetime.** Every normal `cache()` context is constructed with `skipPropagation: false`; both misses and hits propagate. There is one internal `skipPropagation: true`, but it is only used for **background revalidation**, whose output is explicitly not returned to the enclosing render. A static shell can instead **omit** short-lived cached data as a dynamic hole; then the data is not in that shell/artifact, which is not an inheritance-suppression escape hatch.

---

## 1. Nested tags are inherited, including on cache hits

### A cache function owns a tag accumulator

`cacheTag()` is only legal in `'use cache'` scopes and appends to that scope's `tags`:

`packages/next/src/server/use-cache/cache-tag.ts:8-39`

```ts
case 'cache':
case 'private-cache':
  break
// ...
if (!workUnitStore.tags) {
  workUnitStore.tags = validTags
} else {
  workUnitStore.tags.push(...validTags)
}
```

### Miss/fill path: `collectResult` turns the inner accumulator into entry metadata, then propagates it

`collectResult` waits until the RSC stream ends specifically so all tags have been collected, builds the entry from `innerCacheStore.tags`, then passes that metadata outward:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:1126-1174, 1218-1256`

```ts
// ensure that RSC has finished rendering and therefore we have collected
// all tags.
for (let entry; !(entry = await reader.read()).done; ) {
  buffer.push(entry.value)
}

const collectedTags = innerCacheStore.tags
const entry: CacheEntry = {
  // ...
  tags: collectedTags === null ? [] : collectedTags,
}

if (!cacheContext.skipPropagation) {
  maybePropagateCacheEntryMetadata(cacheContext, {
    tags: collected.entry.tags,
    revalidate: collected.entry.revalidate,
    expire: collected.entry.expire,
    stale: collected.entry.stale,
    // ...
  })
}
```

For an outer public `'use cache'`, `cache()` makes that outer cache's `UseCacheStore` the context and enables propagation:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:1915-1953`

```ts
case 'cache': {
  // `workUnitStore` is the enclosing public cache store.
  cacheContext = {
    kind: 'public',
    outerWorkUnitStore: workUnitStore,
    skipPropagation: false,
    // ...
  }
}
```

`propagateCacheLifeAndTagsToRevalidateStore` deduplicates and unions tags into the outer store. A public cache store implements `RevalidateStore`, so it is subsequently serialized as the outer entry's `tags` by its own `collectResult` call. This is the transitive step.

`packages/next/src/server/use-cache/use-cache-wrapper.ts:932-956, 1001-1019`

```ts
const outerTags = (revalidateStore.tags ??= [])
for (const tag of metadata.tags) {
  if (!outerTags.includes(tag)) {
    outerTags.push(tag)
  }
}
// ...
case 'cache':
  // ...
// fallthrough
case 'prerender':
case 'prerender-runtime':
case 'prerender-legacy':
  propagateCacheLifeAndTagsToRevalidateStore(
    cacheContext.outerWorkUnitStore,
    metadata
  )
```

### Hit path: metadata is propagated too

This is not restricted to generation/fills. On a persistent cache-handler hit, the wrapper constructs `entryMetadata` from the hit's saved `entry.tags` and calls the same propagation path:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:3421-3443`

```ts
const entryMetadata: CacheResultMetadata = {
  tags: entry.tags,
  revalidate: entry.revalidate,
  expire: entry.expire,
  stale: entry.stale,
  // ...
}
maybePropagateCacheEntryMetadata(cacheContext, entryMetadata)
```

On an RDC hit during the final prerender it likewise calls the unconditional propagator after eligibility checks:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:2674-2690`

```ts
// only propagate cache life & tags if the entry was *not* omitted
// from the prerender.
propagateCacheEntryMetadata(cacheContext, {
  tags: rdcResult.entry.tags,
  revalidate: rdcResult.entry.revalidate,
  expire: rdcResult.entry.expire,
  stale: rdcResult.entry.stale,
  // ...
})
```

Therefore **tags are transitive on hits as well as misses**. The source includes an end-to-end assertion of the resulting outer entry metadata: inner `inner`, outer entries `outer1,inner` and `outer2,inner`, with the inner lifetime (180/300).

`test/e2e/app-dir/use-cache-custom-handler/use-cache-custom-handler.test.ts:137-159`.

### Why invalidating the inner tag invalidates the outer entry

The stored outer entry now includes `inner`, and cache-entry validity checks its complete tag list against recently revalidated tags:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:3728-3736`

```ts
if (
  entry.tags.some((tag) =>
    isRevalidatedAfter(tag, entry.timestamp, workStore, logPrefix)
  )
) {
  return true
}
```

The RDC path performs the same check before serving its cached result (`:2373-2393`). Thus `revalidateTag`/`updateTag` affecting `inner` invalidates outer entries carrying `inner`. Tags do not themselves have a per-tag “expire” field here; expiration is entry `expire`, described below.

## 2. Inner cache life: min-wins accumulator, with an explicit-outer override

The same propagation helper applies minimum values, expressed as guarded assignments rather than `Math.min`:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:945-956`

```ts
if (revalidateStore.stale > metadata.stale) {
  revalidateStore.stale = metadata.stale
}
if (revalidateStore.revalidate > metadata.revalidate) {
  revalidateStore.revalidate = metadata.revalidate
}
if (revalidateStore.expire > metadata.expire) {
  revalidateStore.expire = metadata.expire
}
```

`collectResult` makes the qualification explicit: a cache scope that does **not** call `cacheLife()` uses the lowest lifetime accumulated from inner `fetch`, `unstable_cache`, or nested `'use cache'`; its own explicit value wins if set:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:1200-1216`

```ts
// Otherwise, we use the lowest of all inner fetch(),
// unstable_cache() or nested "use cache", if they're lower than our default.
const collectedRevalidate =
  innerCacheStore.explicitRevalidate !== undefined
    ? innerCacheStore.explicitRevalidate
    : innerCacheStore.revalidate
// Equivalent selection for expire and stale.
```

An explicit `cacheLife()` is itself min-wins *within that cache scope* (`cache-life.ts:94-125`); it records the lowest explicit values. Those explicit values determine that entry's own life in `collectResult`, so an inner value does **not** shorten an outer entry whose outer scope explicitly chose a longer life. The outer entry's resulting metadata still propagates outward and can clamp its parent.

For an eligible page-level cached read, the outer `PrerenderStore` is also a `RevalidateStore` (`work-unit-async-storage.external.ts:236-241`), so the exact helper above clamps its `revalidate`. The final artifact copies it into route metadata:

`packages/next/src/server/app-render/app-render.tsx:3438-3470`

```ts
if (response.collectedTags) {
  metadata.fetchTags = response.collectedTags.join(',')
}
metadata.cacheControl = {
  revalidate:
    response.collectedRevalidate >= INFINITE_CACHE
      ? false
      : response.collectedRevalidate,
  expire: response.collectedExpire >= INFINITE_CACHE
    ? undefined
    : response.collectedExpire,
}
```

So the route ISR time is also min-wins for cache reads **included in the static result**.

## 3. Page (not `'use cache'`) → static route artifact/shell

In cache-components prerendering, the final server pass creates a `PrerenderStore` initialized with route implicit tags and infinite lifetimes:

`packages/next/src/server/app-render/app-render.tsx:9053-9074`

```ts
const finalServerPrerenderStore: PrerenderStore = {
  type: 'prerender',
  implicitTags,
  revalidate: INFINITE_CACHE,
  expire: INFINITE_CACHE,
  stale: INFINITE_CACHE,
  tags: [...implicitTags.tags],
  resumeDataCache,
  // ...
}
```

A public `'use cache'` called directly by that page is given this store as `outerWorkUnitStore` (`use-cache-wrapper.ts:1955-1973`, `skipPropagation: false`). During the prospective prerender, propagation is deliberately deferred because the cache result can later be excluded from the static output:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:1050-1070`

```ts
case 'prerender':
case 'prerender-runtime': {
  // Don't propagate yet — the entry might be omitted from the final
  // prerender due to short expire/stale times.
  break
}
```

In the final render the prefilled RDC entry is tested. If eligible, `propagateCacheEntryMetadata` adds its tags and min-clamps the final `PrerenderStore` (`use-cache-wrapper.ts:2674-2690`, quoted above). The returned `PrerenderToStreamResult` exposes that store:

`packages/next/src/server/app-render/app-render.tsx:9445-9455`

```ts
collectedRevalidate: finalServerPrerenderStore.revalidate,
collectedExpire: finalServerPrerenderStore.expire,
collectedStale: selectStaleTime(finalServerPrerenderStore.stale),
collectedTags: finalServerPrerenderStore.tags,
```

`applyMetadataFromPrerenderResult` then serializes tags into `metadata.fetchTags` and the page route writer writes that value as `x-next-cache-tags` for a prerendered app page:

`packages/next/src/export/routes/app-page.ts:187-194`

```ts
if (fetchTags) {
  headers[NEXT_CACHE_TAGS_HEADER] = fetchTags
}
```

### Shell qualification matters

A short `revalidate: 0` or `expire < MIN_PRERENDERABLE_EXPIRE` cache result is omitted from the static prerender and returned as a runtime hanging promise (`use-cache-wrapper.ts:2397-2464`). A short `stale` may be delayed until post-shell or omitted from a shell (`:2523-2605`). The final-RDC propagator is intentionally below those early returns. Therefore a non-cached page only attaches a function's metadata to the **artifact/shell that actually includes that function's data**.

## 4. Can a normal caller opt out of propagation?

### No public/supported opt-out

There is no `cacheTag`, `cacheLife`, `cache`, or `unstable_cache` option that says “read this but do not propagate.” `cacheTag()`/`cacheLife()` only operate inside a cache scope; normal `cache()` contexts set `skipPropagation: false` for page/prerender, request, enclosing cache, and `unstable_cache` callers (`use-cache-wrapper.ts:1899-1973`). Both hit paths and the fill path above call the propagator.

`unstable_cache` is not an exception. When nested in a cache or prerender it directly updates the enclosing store's revalidate and tags:

`packages/next/src/server/web/spec-extension/unstable-cache.ts:188-211`

```ts
if (typeof revalidate === 'number') {
  if (workUnitStore.revalidate < revalidate) {
    // shorter existing interval: leave it alone
  } else {
    workUnitStore.revalidate = revalidate
  }
}
const collectedTags = workUnitStore.tags
// initializes with tags or appends deduplicated tags
```

### The sole internal bypass is background refresh, not rendered data

`skipPropagation` has one true-setting site. It invokes `generateCacheEntry` during stale-while-revalidate background work and the comment explicitly says it skips tags/lifetimes “back to the outer scope”:

`packages/next/src/server/use-cache/use-cache-wrapper.ts:3529-3545`

```ts
// The background revalidation preserves the outer store for
// reading (e.g. implicitTags) but skips propagation of cache life
// and tags back to the outer scope.
{
  ...cacheContext,
  skipPropagation: true,
}
```

This is internal implementation plumbing, not an application API, and its stream is named `ignoredStream` and cancelled (`:3547-3565`): it refreshes the cache entry in the background rather than supplying data to the enclosing render/artifact.

### The only artifact-level non-inheritance behavior is omission

For a static page/shell, short-lived data can be placed behind a runtime/dynamic boundary; because the cache read returns before the final-RDC propagation call, its tags/lifetimes do not attach to that static shell. But that shell does **not** contain the data. Conversely, nesting that short-lived public cache inside an outer public `'use cache'` is not an opt-out: the implementation tracks a nested-dynamic error and can require the outer cache to make an explicit lifetime decision (`use-cache-wrapper.ts:2401-2437`).

**Conclusion:** inclusion and metadata inheritance are coupled by design. The supported choices are (a) include the cached data and inherit its invalidation/lifetime dependencies, or (b) exclude/defer it from the static artifact. There is no supported or general internal caller-facing “dependency-free cached read.”
