import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";

export type Product = {
  slug: string;
  name: string;
  price: number;
  description: string;
  accent: string;
};

export type ProductTier = "super-top" | "on-demand" | "long-tail";

export const superTopProducts: Product[] = [
  { slug: "orbital-chair", name: "Orbital Chair", price: 680, description: "A sculptural lounge chair with a powder-coated steel frame.", accent: "coral" },
  { slug: "halo-lamp", name: "Halo Lamp", price: 240, description: "A dimmable opal-glass lamp for warm, low-glare light.", accent: "gold" },
  { slug: "grid-shelf", name: "Grid Shelf", price: 420, description: "A modular aluminum shelf built to move with your space.", accent: "blue" },
  { slug: "arch-desk", name: "Arch Desk", price: 890, description: "A compact solid-oak desk with cable management underneath.", accent: "green" },
  { slug: "loft-speaker", name: "Loft Speaker", price: 360, description: "A tactile desktop speaker tuned for focused work.", accent: "purple" },
];

export const onDemandProducts: Product[] = [
  { slug: "linen-coasters", name: "Linen Coasters", price: 28, description: "A set of four hand-woven coasters.", accent: "rose" },
  { slug: "mini-vase", name: "Mini Vase", price: 44, description: "A small recycled-glass vase for a single stem.", accent: "cyan" },
  { slug: "copper-hooks", name: "Copper Hooks", price: 52, description: "Three small wall hooks with a living finish.", accent: "orange" },
  { slug: "paper-tray", name: "Paper Tray", price: 38, description: "A powder-coated tray for notes, mail, and receipts.", accent: "yellow" },
  { slug: "wool-mat", name: "Wool Desk Mat", price: 72, description: "A soft felt work surface cut from dense merino wool.", accent: "slate" },
];

export const longTailProducts: Product[] = [
  { slug: "brass-clip", name: "Brass Paper Clip", price: 18, description: "A satisfyingly weighty clip machined from brass.", accent: "gold" },
  { slug: "cork-trivet", name: "Cork Trivet", price: 32, description: "A heat-proof cork rest for the centre of the table.", accent: "orange" },
  { slug: "glass-cup", name: "Ripple Glass Cup", price: 26, description: "A hand-blown daily glass with a gently rippled profile.", accent: "cyan" },
  { slug: "ink-pad", name: "Indigo Ink Pad", price: 24, description: "A small archival ink pad for stamps and labels.", accent: "blue" },
  { slug: "walnut-block", name: "Walnut Monitor Block", price: 96, description: "A low riser carved from a single piece of walnut.", accent: "green" },
];

export const products = [...superTopProducts, ...onDemandProducts, ...longTailProducts];

export function findProduct(slug: string) {
  return products.find((product) => product.slug === slug);
}

export function catalogTier(slug: string): ProductTier | null {
  if (superTopProducts.some((product) => product.slug === slug)) return "super-top";
  if (onDemandProducts.some((product) => product.slug === slug)) return "on-demand";
  if (longTailProducts.some((product) => product.slug === slug)) return "long-tail";
  return null;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Used by both cacheable tiers. Super-top values fill at build; on-demand values fill after a real visit. */
export async function getCachedProduct(slug: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`product:${slug}`);

  await delay(1_600);
  const product = findProduct(slug);
  if (!product) return null;

  return { product, cacheStamp: new Date().toISOString() };
}

/** Deliberately request-time. This branch can never become fully cached product content. */
export async function getFreshLongTailProduct(slug: string) {
  await connection();
  await delay(1_600);
  const product = findProduct(slug);
  if (!product) return null;

  return { product, requestStamp: new Date().toISOString() };
}
