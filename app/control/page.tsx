import { deliveryControlProducts, products, readProductDeliveries } from "@/lib/products";
import { invalidateFooter, invalidateHeader, invalidateProduct, toggleProductDelivery } from "./actions";

// The confirmation is URL-specific. This admin-only demo page is intentionally blocking.
export const instant = false;

export default async function ControlPage({ searchParams }: PageProps<"/control">) {
  const message = (await searchParams).message;
  const deliveries = await readProductDeliveries();
  return (
    <main className="page-shell control-page">
      <p className="eyebrow">Cache controls</p>
      <h1>Expire one tag at a time.</h1>
      <p>These Server Actions use <code>updateTag</code>, so the next read is a cache miss. The timestamps in the UI make each refill visible.</p>
      {message && <p className="flash" role="status">{message}</p>}
      <section className="control-grid">
        <Control title="Shared chrome" description="Each is an independently cached component.">
          <form action={invalidateHeader}><button>Invalidate header</button></form>
          <form action={invalidateFooter}><button>Invalidate footer</button></form>
        </Control>
        <Control title="Product delivery" description="These five products stream by default. Select one to cache it after its next visit. Select it again to return it to streaming. Other products are untouched.">
          <ul className="upgrade-list">
            {deliveryControlProducts.map((product) => {
              const isCachedOnVisit = deliveries.get(product.slug) === "upgrade";
              return (
                <li key={product.slug}>
                  <form action={toggleProductDelivery}>
                    <input type="hidden" name="slug" value={product.slug} />
                    <button className={`upgrade-toggle${isCachedOnVisit ? " is-upgraded" : ""}`}>
                      <span aria-hidden>{isCachedOnVisit ? "\u2611" : "\u2610"}</span>
                      <span>{product.name}</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Control>
        <Control title="Individual product" description="Build and cached-on-visit products have tagged detail caches. Streaming product detail is never cached.">
          <form action={invalidateProduct} className="product-invalidator">
            <label htmlFor="slug">Product</label>
            <select id="slug" name="slug" defaultValue={products[0].slug}>
              {products.map((product) => <option value={product.slug} key={product.slug}>{product.name}</option>)}
            </select>
            <button>Invalidate product</button>
          </form>
        </Control>
      </section>
      <section className="how-it-works">
        <h2>Test sequence</h2>
        <ol>
          <li>Open a build product. It was prerendered at build time.</li>
          <li>Directly open a cached-on-visit product, then reload it. Its delayed detail becomes cacheable after the first request.</li>
          <li>Open a streaming product repeatedly. Its detail remains request-time and streams after 1.6 seconds.</li>
          <li>Invalidate a tag here, then hard reload the relevant route and compare its timestamp.</li>
          <li>Select a streaming product, then open it. Its next visit becomes cached while every other product keeps its original cache timestamp.</li>
          <li>Inspect <code>/api/products/[slug]</code> for fake product behavior. Product delivery settings live in Vercel KV (Upstash).</li>
        </ol>
      </section>
    </main>
  );
}

function Control({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="control-card"><h2>{title}</h2><p>{description}</p><div>{children}</div></section>;
}
