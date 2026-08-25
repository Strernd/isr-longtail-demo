import { products } from "@/lib/products";
import { invalidateFooter, invalidateHeader, invalidateProduct, invalidateRanking } from "./actions";

// The confirmation is URL-specific. This admin-only demo page is intentionally blocking.
export const instant = false;

export default async function ControlPage({ searchParams }: PageProps<"/control">) {
  const message = (await searchParams).message;
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
        <Control title="Ranking endpoint" description="Invalidates the cached external ranking source and the super-top/on-demand classification.">
          <form action={invalidateRanking}><button>Invalidate top-products</button></form>
        </Control>
        <Control title="Individual product" description="Super-top and on-demand products own tagged detail caches. Long-tail product detail is never cached.">
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
          <li>Open a super-top product. It was prerendered at build time.</li>
          <li>Directly open an on-demand product, then reload it. Its delayed detail becomes cacheable after the first request.</li>
          <li>Open a long-tail product repeatedly. Its detail remains request-time and streams after 1.6 seconds.</li>
          <li>Invalidate a tag here, then hard reload the relevant route and compare its timestamp.</li>
          <li>Inspect <code>/api/products/[slug]</code> for fake product behavior, or open the public ranking Gist to inspect its external source data.</li>
        </ol>
      </section>
    </main>
  );
}

function Control({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return <section className="control-card"><h2>{title}</h2><p>{description}</p><div>{children}</div></section>;
}
