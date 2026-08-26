import Link from "next/link";
import { getCatalogProductDeliveries, products, PRODUCT_DELIVERY_LABELS } from "@/lib/products";

export default async function Home() {
  const deliveries = await getCatalogProductDeliveries();
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Next.js 16.3 cache experiment</p>
        <h1>One catalog. Three delivery modes.</h1>
        <p>Some products ship at build time. Some become cached only after a real request. Others always keep their fresh product data behind a streamed boundary.</p>
      </section>
      <section className="catalog" aria-label="Product catalog">
        {products.map((product) => {
          const delivery = deliveries.get(product.slug) ?? "long-tail";
          return (
            <Link
              className="product-card"
              href={`/products/${product.slug}`}
              key={product.slug}
              prefetch={delivery === "build"}
            >
              <div className={`swatch ${product.accent}`} />
              <p className={`badge ${delivery}`}>{PRODUCT_DELIVERY_LABELS[delivery]}</p>
              <h2>{product.name}</h2>
              <p>${product.price}</p>
              <span className="product-link">Open product <span aria-hidden>→</span></span>
            </Link>
          );
        })}
      </section>
      <aside className="note">
        <strong>Demo behavior:</strong> only build products prefetch. Cached-on-visit and streaming products wait for a real request.
      </aside>
    </main>
  );
}
