/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  allowedDevOrigins: ['192.168.25.203'],
  serverExternalPackages: ['chokidar', 'fsevents'],
};

export default nextConfig;
