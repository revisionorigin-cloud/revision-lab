import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // v1.1: 별도 시세 페이지는 없다. 옛 주소는 Pro의 01 시장 절로 보낸다(308 · 쿼리 유지).
  redirects: async () => [{ source: "/market", destination: "/pro", permanent: true }],
};

export default nextConfig;
