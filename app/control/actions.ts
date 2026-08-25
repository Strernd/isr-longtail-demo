"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

function complete(message: string) {
  redirect(`/control?message=${encodeURIComponent(message)}`);
}

export async function invalidateHeader() { updateTag("chrome:header"); complete("Header tag expired. Reload any page to refill it."); }
export async function invalidateFooter() { updateTag("chrome:footer"); complete("Footer tag expired. Reload any page to refill it."); }
export async function invalidateRanking() { updateTag("products:top"); complete("Top-products endpoint tag expired."); }
export async function invalidateProduct(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  if (!/^[a-z0-9-]+$/.test(slug)) complete("Invalid product slug.");
  updateTag(`product:${slug}`);
  complete(`Product tag expired: ${slug}. Long-tail products have no product cache entry.`);
}
