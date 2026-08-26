"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { deliveryControlProducts, findProduct, readProductDeliveries, setProductDelivery } from "@/lib/products";

function complete(message: string) {
  redirect(`/control?message=${encodeURIComponent(message)}`);
}

export async function invalidateHeader() { updateTag("chrome:header"); complete("Header tag expired. Reload any page to refill it."); }
export async function invalidateFooter() { updateTag("chrome:footer"); complete("Footer tag expired. Reload any page to refill it."); }

/** Switches one eligible product between request-time and cached-on-visit. */
export async function toggleProductDelivery(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  if (!deliveryControlProducts.some((product) => product.slug === slug)) return complete("Invalid product slug.");

  const deliveries = await readProductDeliveries();
  const upgrade = deliveries.get(slug) !== "upgrade";
  await setProductDelivery(slug, upgrade ? "upgrade" : null);
  updateTag(`product-delivery:${slug}`);
  updateTag("product-deliveries");

  complete(
    upgrade
      ? `${slug} now caches after its next visit.`
      : `${slug} now streams on every request.`,
  );
}

export async function invalidateProduct(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  if (!findProduct(slug)) return complete("Invalid product slug.");
  updateTag(`product:${slug}`);
  complete(`Product cache expired: ${slug}. Its delivery mode determines the next request.`);
}
