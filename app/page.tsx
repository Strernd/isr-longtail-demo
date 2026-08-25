import Link from "next/link";
import { products, productTier } from "@/lib/products";

const tierCopy = {
  "super-top": "Build prerendered",
  "on-demand": "Cache on real visit",
  "long-tail": "Always streams",
};

export default function Home() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Next.js 16.3 cache experiment</p>
        <h1>One catalog. Three delivery tiers.</h1>
        <p>Five products ship at build time. Five become cached only after a real request. Five always keep their fresh product data behind a streamed boundary.</p>
      </section>
      <section className="catalog" aria-label="Product catalog">
        {products.map((product) => {
          const tier = productTier(product.slug)!;
          return (
            <Link
              className="product-card"
              href={`/products/${product.slug}`}
              key={product.slug}
              prefetch={tier === "super-top" ? true : false}
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
        <strong>Demo behavior:</strong> super-top cards runtime-prefetch because they were already built. On-demand and long-tail cards disable speculative prefetching, so only a real request can warm an on-demand product. Direct visits to either still receive the PPR document shell while product data resolves.
      </aside>
    </main>
  );
}
