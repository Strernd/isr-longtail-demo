import { getTopProducts } from "@/lib/products";

export async function GET() {
  return Response.json(await getTopProducts());
}
