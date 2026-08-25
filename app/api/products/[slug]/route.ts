import { getRankedProductTier } from "@/lib/ranking";
import { findProduct, getCachedProduct, getFreshLongTailProduct } from "@/lib/products";

export async function GET(_: Request, { params }: RouteContext<"/api/products/[slug]">) {
  const { slug } = await params;
  if (!findProduct(slug)) return Response.json({ error: "Not found" }, { status: 404 });
  const tier = await getRankedProductTier(slug);

  const detail = tier === "long-tail" ? await getFreshLongTailProduct(slug) : await getCachedProduct(slug);
  return Response.json({ tier, detail });
}
