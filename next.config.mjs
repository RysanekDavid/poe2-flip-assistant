/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // better-sqlite3 is a native addon — must not be bundled by Next/webpack.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
