import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Paquetes workspace ESM (type: module) que importan con extensión .js.
  // Sin esto, Turbopack no resuelve los imports relativos `./foo.js` que
  // realmente apuntan a archivos `.ts` (los packages se sirven sin compilar).
  transpilePackages: ['@lince/db', '@lince/crawlers-core'],
};

export default nextConfig;
