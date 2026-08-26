import { getProduct } from "@/lib/products";

export async function GET(_: Request, { params }: RouteContext<"/api/products/[slug]">) {
  const { slug } = await params;
  const detail = await getProduct(slug);
  if (!detail) return Response.json({ error: "Not found" }, { status: 404 });

  return Response.json(detail);
}
