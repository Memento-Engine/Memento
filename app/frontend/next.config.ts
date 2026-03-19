import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  output: "export",
  experimental: {
    externalDir: true,
  },
  turbopack: {
    root: path.resolve(__dirname, "../.."),
    resolveAlias: {
      "@shared": path.resolve(__dirname, "../../shared"),
    },
  },
  webpack: (config, { dir }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@shared": path.resolve(dir, "../../shared"),
    };
    return config;
  },
};

export default nextConfig;
