import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "react-markdown",
      "sonner",
    ],
  },
  serverExternalPackages: ["mongoose", "cloudinary", "yazl"],
};

export default nextConfig;
