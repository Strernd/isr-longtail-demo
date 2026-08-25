import { findProduct, getCachedProduct, getFreshLongTailProduct, productTier } from "@/lib/products";

export async function GET(_: Request, { params }: RouteContext<"/api/products/[slug]">) {
  const { slug } = await params;
  const tier = productTier(slug);
  if (!tier || !findProduct(slug)) return Response.json({ error: "Not found" }, { status: 404 });

  const detail = tier === "long-tail" ? await getFreshLongTailProduct(slug) : await getCachedProduct(slug);
  return Response.json({ tier, detail });
}
