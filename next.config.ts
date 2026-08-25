import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    rankings: {
      stale: 900,
      revalidate: 900,
      expire: 3600,
    },
  },
};

export default nextConfig;
