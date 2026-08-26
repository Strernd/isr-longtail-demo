import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  getBuildProductSlugs,
  getProduct,
  PRODUCT_DELIVERY_LABELS,
  type Product,
  type ProductDelivery,
} from "@/lib/products";

export async function generateStaticParams() {
  return getBuildProductSlugs();
}

export default function ProductPage(props: PageProps<"/products/[slug]">) {
  return (
    <main className="page-shell product-page">
      <p className="eyebrow">Product detail</p>
      <Suspense fallback={<ProductSkeleton />}>
        <ProductRoute params={props.params} />
      </Suspense>
    </main>
  );
}

async function ProductRoute({ params }: Pick<PageProps<"/products/[slug]">, "params">) {
  const { slug } = await params;
  const detail = await getProduct(slug);
  if (!detail) notFound();

  return <ProductDetail product={detail.product} delivery={detail.delivery} stamp={detail.stamp} />;
}

function ProductDetail({ product, delivery, stamp }: { product: Product; delivery: ProductDelivery; stamp: string }) {
  return (
    <>
      <div className="route-status"><span className={`badge ${delivery}`}>{PRODUCT_DELIVERY_LABELS[delivery]}</span><span>{stamp}</span></div>
      <article className="product-detail">
        <div className={`detail-swatch ${product.accent}`} />
        <div>
          <h1>{product.name}</h1>
          <p className="price">${product.price}</p>
          <p className="description">{product.description}</p>
        </div>
      </article>
    </>
  );
}

function ProductSkeleton() {
  return (
    <>
      <div className="route-status product-skeleton-status" aria-hidden="true">
        <span className="loading-block loading-badge" />
        <span className="loading-block loading-status" />
      </div>
      <article className="product-detail product-skeleton" aria-busy="true">
        <div className="detail-swatch loading-block" />
        <div>
          <h1><span className="loading-block loading-title" /></h1>
          <p className="price"><span className="loading-block loading-price" /></p>
          <p className="description"><span className="loading-block loading-description" /></p>
        </div>
      </article>
    </>
  );
}
