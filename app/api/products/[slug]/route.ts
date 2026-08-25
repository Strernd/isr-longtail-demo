import { findProduct, getCachedProduct, getFreshLongTailProduct, getProductTier } from "@/lib/products";

export async function GET(_: Request, { params }: RouteContext<"/api/products/[slug]">) {
  const { slug } = await params;
  if (!findProduct(slug)) return Response.json({ error: "Not found" }, { status: 404 });
  const tier = getProductTier(slug);
  if (!tier) return Response.json({ error: "Not found" }, { status: 404 });

  const detail = tier === "long-tail" ? await getFreshLongTailProduct(slug) : await getCachedProduct(slug);
  return Response.json({ tier, detail });
}
