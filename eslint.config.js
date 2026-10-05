import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['**/dist/**', '**/node_modules/**', 'infra/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['packages/web/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['packages/api/**/*.{ts,mjs}', 'packages/shared/**/*.ts'],
    languageOptions: { globals: globals.node },
  },
);
