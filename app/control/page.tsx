import { longTailProducts, products } from "@/lib/products";
import { getTierAssignments } from "@/lib/tiers";
import { invalidateFooter, invalidateHeader, invalidateProduct, toggleUpgrade } from "./actions";

// The confirmation is URL-specific. This admin-only demo page is intentionally blocking.
export const instant = false;

export default async function ControlPage({ searchParams }: PageProps<"/control">) {
  const message = (await searchParams).message;
  const assignments = await getTierAssignments();
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
        <Control title="KV upgrade set" description="The five long-tail products stream by default. Check one to upgrade it: its very next visit fills a permanent cache. Uncheck to send it back to streaming. Every other product stays untouched.">
          <ul className="upgrade-list">
            {longTailProducts.map((product) => {
              const isUpgraded = assignments.get(product.slug) === "upgrade";
              return (
                <li key={product.slug}>
                  <form action={toggleUpgrade}>
                    <input type="hidden" name="slug" value={product.slug} />
                    <input type="hidden" name="upgraded" value={isUpgraded ? "0" : "1"} />
                    <button className={`upgrade-toggle${isUpgraded ? " is-upgraded" : ""}`}>
                      <span aria-hidden>{isUpgraded ? "\u2611" : "\u2610"}</span>
                      <span>{product.name}</span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </Control>
        <Control title="Individual product" description="Build and upgrade products own tagged detail caches. Long-tail product detail is never cached.">
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
          <li>Directly open an upgrade product, then reload it. Its delayed detail becomes cacheable after the first request.</li>
          <li>Open a long-tail product repeatedly. Its detail remains request-time and streams after 1.6 seconds.</li>
          <li>Invalidate a tag here, then hard reload the relevant route and compare its timestamp.</li>
          <li>Check a long-tail product in the KV upgrade set, then open it: it becomes permanently cached on its next visit while every other product keeps its original cache timestamp.</li>
          <li>Inspect <code>/api/products/[slug]</code> for fake product behavior. The upgrade set lives in Vercel KV (Upstash).</li>
        </ol>
      </section>
    </main>
  );
}

function Control({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="control-card"><h2>{title}</h2><p>{description}</p><div>{children}</div></section>;
}
