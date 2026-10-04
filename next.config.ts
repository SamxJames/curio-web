import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Collection used to have a History tab at /collection?tab=history;
      // History is its own page now. Next passes the request's query
      // through, so this lands on /history?tab=history, which /history
      // ignores.
      {
        source: "/collection",
        has: [{ type: "query", key: "tab", value: "history" }],
        destination: "/history",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
