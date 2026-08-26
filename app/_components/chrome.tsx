import Link from "next/link";
import { cacheLife, cacheTag } from "next/cache";

export async function Header() {
  "use cache";
  cacheLife("forever");
  cacheTag("chrome:header");
  const cacheStamp = new Date().toISOString();

  return (
    <header className="site-header">
      <Link className="brand" href="/">Cache Atelier</Link>
      <nav aria-label="Primary navigation">
        <Link href="/">Catalog</Link>
        <Link href="/control">Cache controls</Link>
      </nav>
      <small>header cache: {cacheStamp}</small>
    </header>
  );
}

export async function Footer() {
  "use cache";
  cacheLife("forever");
  cacheTag("chrome:footer");
  const cacheStamp = new Date().toISOString();

  return (
    <footer className="site-footer">
      <span>Cache Atelier, a deliberately slow shop.</span>
      <small>footer cache: {cacheStamp}</small>
    </footer>
  );
}
