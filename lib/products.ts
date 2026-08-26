import { Redis } from "@upstash/redis";
import { cacheLife, cacheTag } from "next/cache";
import catalog from "./products.json";
import { connection } from "next/server";

export type Product = {
  slug: string;
  name: string;
  price: number;
  description: string;
  accent: string;
};

export type ProductDelivery = "build" | "upgrade" | "long-tail";

type CacheableProductDelivery = Exclude<ProductDelivery, "long-tail">;

export const PRODUCT_DELIVERY_LABELS: Record<ProductDelivery, string> = {
  build: "Build prerendered",
  upgrade: "Cached on visit",
  "long-tail": "Always streams",
};

export const products: Product[] = catalog;

/** Products whose delivery mode the control page lets you change. */
export const deliveryControlProducts = products.slice(10);

export function findProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}

const PRODUCT_DELIVERIES_KEY = "product-tiers";
const redis = Redis.fromEnv();

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Uncached Redis read for builds, Server Actions, and dynamic renders. */
export async function readProductDeliveries() {
  const values = await redis.hgetall<Record<string, string>>(PRODUCT_DELIVERIES_KEY);
  const deliveries = new Map<string, CacheableProductDelivery>();

  for (const [slug, delivery] of Object.entries(values ?? {})) {
    if (delivery === "build" || delivery === "upgrade") {
      deliveries.set(slug, delivery);
    }
  }

  return deliveries;
}

export async function getBuildProductSlugs() {
  const deliveries = await readProductDeliveries();
  return [...deliveries.entries()]
    .filter(([slug, delivery]) => delivery === "build" && findProduct(slug) !== undefined)
    .map(([slug]) => ({ slug }));
}

/** Cached delivery modes for catalog badges and prefetch behavior. */
export async function getCatalogProductDeliveries() {
  "use cache";
  cacheLife("forever");
  cacheTag("product-deliveries");
  return readProductDeliveries();
}

/** Sets a product's delivery mode, or returns it to request-time streaming. */
export async function setProductDelivery(slug: string, delivery: CacheableProductDelivery | null) {
  if (delivery === null) {
    await redis.hdel(PRODUCT_DELIVERIES_KEY, slug);
  } else {
    await redis.hset(PRODUCT_DELIVERIES_KEY, { [slug]: delivery });
  }
}

export async function getProduct(slug: string) {
  const delivery = await getProductDelivery(slug);
  const detail = delivery === "long-tail"
    ? await getFreshProduct(slug)
    : await getCachedProduct(slug);

  return detail && { ...detail, delivery };
}

/** Cached delivery settings persist. Long-tail is checked on every request. */
async function getProductDelivery(slug: string): Promise<ProductDelivery> {
  "use cache";
  cacheTag(`product-delivery:${slug}`);

  const assignedDelivery = await redis.hget<string>(PRODUCT_DELIVERIES_KEY, slug);
  if (assignedDelivery === "build" || assignedDelivery === "upgrade") {
    cacheLife("forever");
    return assignedDelivery;
  }

  cacheLife({ revalidate: 0 });
  return "long-tail";
}

async function getCachedProduct(slug: string) {
  "use cache";
  cacheLife("forever");
  cacheTag(`product:${slug}`);

  await delay(1_600);
  const product = findProduct(slug);
  return product && { product, stamp: `product cache: ${new Date().toISOString()}` };
}

async function getFreshProduct(slug: string) {
  await connection();
  await delay(1_600);
  const product = findProduct(slug);
  return product && { product, stamp: `fresh request: ${new Date().toISOString()}` };
}
