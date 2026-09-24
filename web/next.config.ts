import type { NextConfig } from "next";

// The console talks to the gateway through these rewrites, so the browser only ever sees
// one origin: the session cookie and the XSRF-TOKEN cookie stay first-party, and OAuth
// redirects come back through here. GATEWAY_URL is read at build time.
const gateway = process.env.GATEWAY_URL ?? "http://localhost:8080";

const proxied = ["/api/:path*", "/admin/:path*", "/auth/:path*", "/oauth2/:path*", "/login/oauth2/:path*", "/v1/:path*"];

const nextConfig: NextConfig = {
  output: "standalone",
  async rewrites() {
    return proxied.map((source) => ({ source, destination: `${gateway}${source}` }));
  },
};

export default nextConfig;
