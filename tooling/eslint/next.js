import nextPlugin from '@next/eslint-plugin-next';
import globals from 'globals';
import { baseConfig } from './base.js';

/** @param {string} tsconfigRootDir directory of the calling workspace (import.meta.dirname) */
export function nextConfig(tsconfigRootDir) {
  return [
    ...baseConfig(tsconfigRootDir),
    {
      plugins: { '@next/next': nextPlugin },
      languageOptions: { globals: { ...globals.browser } },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
      },
    },
  ];
}
