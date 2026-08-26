"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { setAssignedTier } from "@/lib/tiers";
import { longTailProducts } from "@/lib/products";

function complete(message: string) {
  redirect(`/control?message=${encodeURIComponent(message)}`);
}

export async function invalidateHeader() { updateTag("chrome:header"); complete("Header tag expired. Reload any page to refill it."); }
export async function invalidateFooter() { updateTag("chrome:footer"); complete("Footer tag expired. Reload any page to refill it."); }

/**
 * Toggles a long-tail product's KV tier assignment, then expires exactly that
 * product's tier tag: its verdict and every route artifact carrying the tag.
 * The next request re-evaluates the tier. Every other product stays
 * untouched: no re-render, no ISR write. The `tiers` tag only refreshes the
 * homepage badges.
 */
export async function toggleUpgrade(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const upgraded = formData.get("upgraded") === "1";
  if (!longTailProducts.some((product) => product.slug === slug)) complete("Invalid product slug.");

  await setAssignedTier(slug, upgraded ? "upgrade" : null);
  updateTag(`tier:${slug}`);
  updateTag("tiers");

  complete(
    upgraded
      ? `${slug} added to the KV upgrade set. Its next visit fills a permanent cache.`
      : `${slug} removed from the KV upgrade set. It streams at request time again.`,
  );
}

export async function invalidateProduct(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  if (!/^[a-z0-9-]+$/.test(slug)) complete("Invalid product slug.");
  updateTag(`product:${slug}`);
  complete(`Product tag expired: ${slug}. The active tier determines whether the next request fills this cache.`);
}
