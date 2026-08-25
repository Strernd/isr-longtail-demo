import { cacheLife, cacheTag } from "next/cache";

export type Ranking = {
  superTopSlugs: string[];
  onDemandSlugs: string[];
};

function readSlugs(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

/**
 * Fetches the public ranking service once per `rankings` cache lifetime.
 * The fetch itself is no-store: `use cache` owns this data's lifetime.
 */
export async function getRanking() {
  "use cache";
  cacheLife("rankings");
  cacheTag("products:top");

  const endpoint = process.env.RANKING_API_URL;
  if (!endpoint) throw new Error("Missing RANKING_API_URL");

  const response = await fetch(endpoint, { cache: "no-store" });
  if (!response.ok) throw new Error(`Ranking API failed: ${response.status}`);

  const json = (await response.json()) as Partial<Ranking>;
  return {
    superTopSlugs: readSlugs(json.superTopSlugs),
    onDemandSlugs: readSlugs(json.onDemandSlugs),
    source: endpoint,
    cacheStamp: new Date().toISOString(),
  };
}
