# Next 16.3.1-canary.25: tag invalidation and ISR route artifacts

**Source verified:** `/Users/bernd/dev/vercel/all-the-repos/next.js`, package version `16.3.1-canary.25` (HEAD `e2fb664ceb`). This is source-code behavior, not a claim about an upstream proxy/CDN implementation.

## Answer

| API/event | Tag-manifest write | Next request for an App static route artifact whose `x-next-cache-tags` includes the tag |
|---|---|---|
| `updateTag(tag)` | Immediate **expiration**: `expired = now`. | **Blocking regeneration** in the tag-check branch (`isStale = -1`); self-hosted `FileSystemCache` also returns a hard miss first. See the ISR-time-stale caveat below. |
| `revalidateTag(tag, profile)` | Immediate **staleness**: `stale = now`; also `expired = now + profile.expire * 1000` if the profile has `expire`. | **SWR initially**: stale artifact is returned while re-render runs in the background. (`isStale = true`.) Once the profile's expiration timestamp has passed, it becomes **blocking** (subject to the same ISR-time-stale caveat). |
| `expireTag` | **There is no public `expireTag()` in this version.** The current Cache Components handler API calls this operation `updateTags(tags, durations?)`. | N/A as a public API. A no-duration `updateTags` is the immediate-expiration behavior used by `updateTag`. |

`revalidateTag(tag)` with no second argument is still accepted but warns as deprecated and follows the no-profile/immediate-expiration path. It is therefore blocking, like `updateTag`, at the tag-manifest/ISR-cache level. `updateTag` additionally has Server Action-only/read-your-own-writes behavior (`pathWasRevalidated`), whereas a profiled SWR `revalidateTag` deliberately does **not** mark the path revalidated.

## 1. Call path and exact writes

### Public APIs

`packages/next/src/server/web/spec-extension/revalidate.ts`:

```ts
export function revalidateTag(tag, profile) {
  // object profiles are normalized; absent profile warns
  return revalidate([encodeHeaderSafe(tag)], `revalidateTag ${tag}`, profile)
}

export function updateTag(tag) {
  // Server Action only
  return revalidate([encodeHeaderSafe(tag)], `updateTag ${tag}`, undefined)
}
```

The shared `revalidate()` appends `{ tag, profile, revalidatedAt }` to `workStore.pendingRevalidatedTags`. For no profile, or a profile resolving to `{ expire: 0 }`, it sets `store.pathWasRevalidated`; the source comment says profiled SWR updates do **not** do so: “so that server actions don't pull their own writes.”

`packages/next/src/server/revalidation-utils.ts`, `revalidateTags()`, resolves a named profile from `workStore.cacheLifeProfiles`, retains only `{ expire }`, and calls both cache systems:

```ts
handler.updateTags?.(tagsForProfile, durations)
incrementalCache.revalidateTag(tagsForProfile, durations)
```

No profile means no `durations`. The built-in profiles include `max = { stale: 5m, revalidate: 30d, expire: 1y }` in `packages/next/src/server/config-shared.ts`.

### Manifest representation

`packages/next/src/server/lib/incremental-cache/tags-manifest.external.ts` defines:

```ts
interface TagManifestEntry { stale?: number; expired?: number }
```

and the predicates are timestamp comparisons against the artifact's `lastModified`:

```ts
// expired only if invalidated after this entry was made, and now has reached it
const isImmediatelyExpired = expiredAt <= now && expiredAt > timestamp

// stale if the stale marker was written after this entry was made
return staleAt > timestamp
```

Both built-ins implement the same write logic:

* `packages/next/src/server/lib/cache-handlers/default.ts`, `updateTags()`
* `packages/next/src/server/lib/incremental-cache/file-system-cache.ts`, `revalidateTag()`

```ts
if (durations) {
  updates.stale = now
  if (durations.expire !== undefined) {
    updates.expired = now + durations.expire * 1000
  }
} else {
  tagsManifest.set(tag, { ...existingEntry, expired: now })
}
```

Therefore a profile's `stale` and `revalidate` values are **not written by tag invalidation**. Only the profile's `expire` is passed to `updateTags`/`revalidateTag`; it creates the future hard-expiration bound. The immediate `stale` marker is what triggers SWR.

## 2. ISR route artifact decision: hard/blocking vs SWR

For an App Page/App Route artifact, `packages/next/src/server/lib/incremental-cache/index.ts`, `IncrementalCache.get()`, reads the artifact tag header and chooses:

```ts
if (areTagsExpired(cacheTags, lastModified)) {
  isStale = -1
} else if (areTagsStale(cacheTags, lastModified)) {
  isStale = true
}
```

### Important ordering caveat

The code does **not** unconditionally inspect tags: the tag branch is nested under `if (isStale === undefined)`. If the ordinary route `revalidateAfter` deadline has *already* elapsed, `IncrementalCache.get()` sets `isStale = true` first and skips both `areTagsExpired` and `areTagsStale`. A custom/platform ISR handler that still returns that artifact therefore takes ordinary SWR, even if its tag is immediately expired. By contrast, the checked self-hosted `FileSystemCache.get()` independently inspects `areTagsExpired` for route artifacts and returns `null`, so it remains a hard miss there.

Accordingly, the table and distinctions below describe the normal tag-decision path (and the self-hosted filesystem implementation); exact behavior with a custom handler also depends on whether it rejects expired artifacts and whether the route was already time-stale.

The meaning of `-1` is explicitly documented in `packages/next/src/server/response-cache/types.ts`: “`-1` here dictates a blocking revalidate should be used.” It is also corroborated by `test/production/app-dir/use-cache-expire/use-cache-expire.test.ts`, which expects a changed value in the response once an ISR entry is past `expire`.

`packages/next/src/server/response-cache/index.ts`, `ResponseCache.handleGet()`, supplies the decisive behavior:

```ts
if (previousEntry && !isOnDemandRevalidate && previousEntry.isStale !== -1) {
  resolve(previousEntry) // return old artifact immediately
  resolved = true
  if (!previousEntry.isStale || isPrefetch) return previousEntry
}
// otherwise generate/revalidate
```

Thus:

* **`updateTag` / unprofiled `revalidateTag`:** the expired marker yields `isStale = -1`; the early stale resolve is skipped; the request awaits a fresh static render. This is not “serve stale then refresh.”
* **profiled `revalidateTag`:** the stale marker yields `isStale = true`, provided the tag's future `expired` timestamp has not been reached. The old route artifact resolves to the requester and the generation continues in background (SWR). When `now >= expired`, `areTagsExpired` wins and the next request blocks.

`IncrementalCache.get()` also makes a route's own `cacheControl.expire` blocking (`lastModified + expire < now` => `isStale = -1`) before tag checks. This is independent of the tag-profile expiration above.

The filesystem ISR handler reaches the same hard result earlier: `packages/next/src/server/lib/incremental-cache/file-system-cache.ts`, `FileSystemCache.get()`, returns `null` when an App/Page/Route artifact's tags are expired. A `null` lookup is a miss and forces rendering. It intentionally does not discard merely stale tags, allowing `IncrementalCache.get()`/`ResponseCache` to use the SWR path.

## 3. Does background SWR retain/repopulate the route artifact?

**Yes, if the render produces cache control.** In `packages/next/src/server/response-cache/index.ts`, `ResponseCache.handleRevalidate()` renders, then persists the fresh artifact:

```ts
if (incrementalResponseCacheEntry.cacheControl && !this.minimal_mode) {
  await incrementalCache.set(key, incrementalResponseCacheEntry.value, {
    cacheControl, isRoutePPREnabled, isFallback,
  })
}
```

The first SWR request was already resolved with the old artifact; its background render overwrites/re-caches the same route key. A subsequent request can therefore hit the fresh artifact rather than suffer a user-visible miss. This is conditional on a cacheable result (`cacheControl`) and non-minimal mode; it is not a promise to retain an entry after an eviction or a render failure.

## 4. CacheHandler-interface naming: current vs obsolete

Do not conflate two source interfaces:

1. **Current Cache Components cache handler:** `packages/next/src/server/lib/cache-handlers/types.ts` defines `refreshTags()`, `getExpiration(tags)`, and **`updateTags(tags, durations?)`**. `getExpiration` returns the greatest tag event timestamp (`0` if none; `Infinity` means the handler performs the check in `get`). Request startup makes `refreshTags()` lazy in `packages/next/src/server/async-storage/work-store.ts`; implicit tags lazily query `getExpiration()` in `packages/next/src/server/lib/implicit-tags.ts` and `use-cache/use-cache-wrapper.ts`.

2. **Incremental/ISR cache handler:** `packages/next/src/server/lib/incremental-cache/index.ts`, class `CacheHandler`, has `get`, `set`, and `revalidateTag(tags, durations?)`. This is the path that stores/reads static route artifacts described above.

`expireTags(...tags)` and `receiveExpiredTags(...tags)` are **not present in the checked 16.3.1-canary.25 source interface**. They are old names: `git show e598a4f976^:packages/next/src/server/lib/cache-handlers/types.ts` shows the deprecated legacy `CacheHandler` with those methods; commit `e598a4f976` replaced it with `refreshTags`/`getExpiration`/`updateTags`. The current source also retains only the deprecated error text for `receiveExpiredTags` in `packages/next/errors.json`.

So a platform integration for this checked version should implement the current methods appropriate to its cache layer, preserve the `stale` versus `expired` distinction, propagate/refresh tag state, and honor the timestamp comparison semantics. Calling it `expireTags`/`receiveExpiredTags` describes the pre-`e598a4f976` API, not the current one.
