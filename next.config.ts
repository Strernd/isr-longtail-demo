import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  cacheLife: {
    // Effectively "never revalidate by time": entries and route artifacts on
    // this profile only ever change through tag invalidation. The value is
    // Next's INFINITE_CACHE sentinel (0xfffffffe seconds).
    forever: {
      stale: 300,
      revalidate: 4294967294,
      expire: 4294967294,
    },
  },
};

export default nextConfig;
