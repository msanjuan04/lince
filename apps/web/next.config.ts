import path from 'node:path';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';

loadEnvConfig(path.join(__dirname, '..', '..'));

const nextConfig: NextConfig = {
  // Paquetes workspace ESM (type: module) que importan con extensión .js.
  // Sin esto, Turbopack no resuelve los imports relativos `./foo.js` que
  // realmente apuntan a archivos `.ts` (los packages se sirven sin compilar).
  transpilePackages: ['@lince/db', '@lince/crawlers-core', '@lince/notifier', '@lince/ai'],
};

export default nextConfig;
