import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getProductTier, getTierAssignments } from "@/lib/tiers";
import { findProduct, getCachedProduct, getFreshLongTailProduct, type Product, type ProductTier } from "@/lib/products";

export async function generateStaticParams() {
  // KV is consulted at build time to pick the build-prerendered set. Later
  // tier changes need no deploy: toggling the KV assignment on /control
  // expires that product's tier tag, and its next request adopts the new
  // delivery policy (cacheable verdicts refill forever-cached artifacts,
  // long-tail verdicts are never persisted).
  const assignments = await getTierAssignments();
  return [...assignments.entries()]
    .filter(([slug, tier]) => tier === "build" && Boolean(findProduct(slug)))
    .map(([slug]) => ({ slug }));
}

export default function ProductPage(props: PageProps<"/products/[slug]">) {
  return (
    <main className="page-shell product-page">
      <p className="eyebrow">Product detail</p>
      <Suspense fallback={<ProductShell />}>
        <ProductRoute params={props.params} />
      </Suspense>
    </main>
  );
}

async function ProductRoute({ params }: Pick<PageProps<"/products/[slug]">, "params">) {
  const { slug } = await params;
  if (!findProduct(slug)) notFound();
  const tier = await getProductTier(slug);

  return tier === "long-tail" ? (
    <StreamedLongTailDetail slug={slug} tier={tier} />
  ) : (
    <CachedDetail slug={slug} tier={tier} />
  );
}

async function CachedDetail({ slug, tier }: { slug: string; tier: "build" | "upgrade" }) {
  const result = await getCachedProduct(slug);
  if (!result) notFound();

  return (
    <>
      <TierStatus tier={tier} stamp={`product cache: ${result.cacheStamp}`} />
      <ProductDetail product={result.product} mode={tier === "build" ? "Build-prerendered product" : "Cached-on-visit product"} stamp={`product cache: ${result.cacheStamp}`} />
    </>
  );
}

async function StreamedLongTailDetail({ slug, tier }: { slug: string; tier: "long-tail" }) {
  const result = await getFreshLongTailProduct(slug);
  if (!result) notFound();

  return (
    <>
      <TierStatus tier={tier} stamp={`fresh request: ${result.requestStamp}`} />
      <ProductDetail product={result.product} mode="Request-time product detail" stamp={`fresh request: ${result.requestStamp}`} />
    </>
  );
}

function TierStatus({ tier, stamp }: { tier: ProductTier; stamp: string }) {
  const labels = {
    build: "Build prerendered",
    upgrade: "Cached on visit",
    "long-tail": "Always streams",
  };

  return <div className="route-status"><span className={`badge ${tier}`}>{labels[tier]}</span><span>{stamp}</span></div>;
}

function ProductDetail({ product, mode, stamp }: { product: Product; mode: string; stamp: string }) {
  return (
    <article className="product-detail">
      <div className={`detail-swatch ${product.accent}`} />
      <div>
        <p className="mode">{mode}</p>
        <h1>{product.name}</h1>
        <p className="price">${product.price}</p>
        <p className="description">{product.description}</p>
        <code>{stamp}</code>
      </div>
    </article>
  );
}

function ProductShell() {
  return <div className="product-skeleton" aria-busy="true"><div /><div><p>Finding the product path...</p><h1>Loading product</h1><span /></div></div>;
}
