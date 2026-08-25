import { getRanking } from "@/lib/ranking";
import { findProduct } from "@/lib/products";

export async function GET() {
  const ranking = await getRanking();

  return Response.json({
    ...ranking,
    superTopProducts: ranking.superTopSlugs.map(findProduct).filter(Boolean),
    onDemandProducts: ranking.onDemandSlugs.map(findProduct).filter(Boolean),
  });
}
