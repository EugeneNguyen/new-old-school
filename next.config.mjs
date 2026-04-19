/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['192.168.25.203'],
  serverExternalPackages: ['chokidar', 'fsevents'],
};

export default nextConfig;
