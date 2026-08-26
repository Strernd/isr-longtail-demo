import { cacheLife, cacheTag } from "next/cache";
import type { ProductTier } from "./products";

/**
 * Single source of truth for delivery tiers: a KV hash mapping
 * `slug -> "build" | "upgrade"`. Slugs absent from the hash are long-tail.
 * The catalog in `lib/products.ts` only provides product data.
 */
const TIERS_KEY = "product-tiers";

type AssignedTier = "build" | "upgrade";

/**
 * Raw, uncached Vercel KV (Upstash) REST command. Only call this inside a
 * "use cache" scope, a Server Action, `generateStaticParams`, or an already
 * dynamic render (the control panel). In a cacheable render it would punch a
 * permanent dynamic hole.
 */
async function kv<T>(command: (string | number)[]): Promise<T> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Missing KV_REST_API_URL / KV_REST_API_TOKEN");

  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`KV request failed: ${response.status}`);

  const json = (await response.json()) as { result: T };
  return json.result;
}

function parseAssignments(flat: string[]) {
  const assignments = new Map<string, AssignedTier>();
  for (let i = 0; i < flat.length; i += 2) {
    const tier = flat[i + 1];
    if (tier === "build" || tier === "upgrade") assignments.set(flat[i], tier);
  }
  return assignments;
}

/** Uncached: the full tier assignment. Build time, actions, dynamic renders. */
export async function getTierAssignments() {
  return parseAssignments(await kv<string[]>(["HGETALL", TIERS_KEY]));
}

/**
 * Cached view of the tier assignment for list surfaces (the homepage badges
 * and prefetch policy). Tagged `tiers`, so a toggle refreshes it without
 * touching any product route.
 */
export async function getCachedTierAssignments() {
  "use cache";
  cacheLife("forever");
  cacheTag("tiers");
  return getTierAssignments();
}

/** Assigns a tier to a slug in KV, or clears it back to long-tail. */
export async function setAssignedTier(slug: string, tier: AssignedTier | null) {
  await kv(tier === null ? ["HDEL", TIERS_KEY, slug] : ["HSET", TIERS_KEY, slug, tier]);
}

/**
 * Pure tag carrier: attaches `tier:<slug>` to every product route artifact,
 * including long-tail shells whose verdict below is omitted from the artifact.
 * This gives `updateTag("tier:<slug>")` a deterministic handle to regenerate
 * any product route when its tier changes, and nothing else.
 */
async function tagProductRoute(slug: string) {
  "use cache";
  cacheLife("forever");
  cacheTag(`tier:${slug}`);
  return null;
}

/**
 * Per-product "am I cacheable?" verdict, read from KV.
 *
 * - Cacheable verdicts ("build"/"upgrade") are cached forever and expire only
 *   via `updateTag("tier:<slug>")`. Products whose tier did not change are
 *   never touched: no re-render, no ISR write.
 * - The long-tail verdict is never persisted (`revalidate: 0`): it is excluded
 *   from static shells (a dynamic hole) and re-evaluated against KV on every
 *   request, so a long-tail response can never be cached with a stale verdict
 *   baked in. (In `next dev` only, the dev cache handler retains it for up to
 *   5 minutes.)
 */
async function getTierVerdict(slug: string): Promise<ProductTier> {
  "use cache";
  cacheTag(`tier:${slug}`);

  const assigned = await kv<string | null>(["HGET", TIERS_KEY, slug]);
  if (assigned === "build" || assigned === "upgrade") {
    cacheLife("forever");
    return assigned;
  }

  cacheLife({ revalidate: 0 });
  return "long-tail";
}

/** KV decides delivery policy at render time. */
export async function getProductTier(slug: string) {
  const [, tier] = await Promise.all([tagProductRoute(slug), getTierVerdict(slug)]);
  return tier;
}
