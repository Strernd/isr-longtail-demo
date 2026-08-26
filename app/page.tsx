import Link from "next/link";
import { products } from "@/lib/products";
import { getCachedTierAssignments } from "@/lib/tiers";

const tierCopy = {
  build: "Build prerendered",
  upgrade: "Cached on visit",
  "long-tail": "Always streams",
};

export default async function Home() {
  const tiers = await getCachedTierAssignments();
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Next.js 16.3 cache experiment</p>
        <h1>One catalog. Three delivery tiers.</h1>
        <p>Five products ship at build time. Five become cached only after a real request. Five always keep their fresh product data behind a streamed boundary.</p>
      </section>
      <section className="catalog" aria-label="Product catalog">
        {products.map((product) => {
          const tier = tiers.get(product.slug) ?? "long-tail";
          return (
            <Link
              className="product-card"
              href={`/products/${product.slug}`}
              key={product.slug}
              prefetch={tier === "build" ? true : false}
            >
              <div className={`swatch ${product.accent}`} />
              <p className={`badge ${tier}`}>{tierCopy[tier]}</p>
              <h2>{product.name}</h2>
              <p>${product.price}</p>
              <span className="product-link">Open product <span aria-hidden>→</span></span>
            </Link>
          );
        })}
      </section>
      <aside className="note">
        <strong>Demo behavior:</strong> build cards runtime-prefetch because they were already built. Upgrade and long-tail cards disable speculative prefetching, so only a real request can warm an upgrade product. Direct visits to either still receive the PPR document shell while product data resolves.
      </aside>
    </main>
  );
}
