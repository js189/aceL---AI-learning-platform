/** @type {import('next').NextConfig} */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : null;
const imagePatterns = [
  { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
];
if (supabaseHost) {
  imagePatterns.push({ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/**' });
}
const nextConfig = {
  images: {
    remotePatterns: imagePatterns,
  },
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse'],
  },
};

module.exports = nextConfig;
