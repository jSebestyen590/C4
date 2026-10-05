import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
mkdirSync('dist', { recursive: true });

await build({
  entryPoints: ['src/lambda.ts'],
  outfile: 'dist/lambda/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  minify: true,
  // ESM bundle needs a require shim for CJS deps (pg).
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  external: ['@aws-sdk/*'],
});

// Terraform zips dist/lambda itself (archive_file).
console.log('Built dist/lambda/index.mjs');
