import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  // Componentes y hooks generados por shadcn — no los modificamos a mano,
  // así que relajamos las reglas más estrictas sobre su código.
  {
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/hooks/use-mobile.ts'],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
]);

export default eslintConfig;
