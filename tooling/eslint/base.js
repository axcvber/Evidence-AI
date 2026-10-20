import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Type-aware config shared by every workspace.
 * @param {string} tsconfigRootDir directory of the calling workspace (import.meta.dirname)
 */
export function baseConfig(tsconfigRootDir) {
  return tseslint.config(
    { ignores: ['dist/**', '.next/**', 'coverage/**', 'next-env.d.ts'] },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: {
          projectService: { allowDefaultProject: ['*.js', '*.mjs'] },
          tsconfigRootDir,
        },
      },
      rules: {
        '@typescript-eslint/no-floating-promises': 'error',
        // Nest modules are empty classes carrying a @Module() decorator.
        '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
        ],
        // Nest DI reads constructor types from decorator metadata, so those imports must stay value imports.
        '@typescript-eslint/consistent-type-imports': 'off',
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        // `onChange={(e) => setValue(e.target.value)}` is idiomatic; still flags other void returns.
        '@typescript-eslint/no-confusing-void-expression': [
          'error',
          { ignoreArrowShorthand: true },
        ],
      },
    },
    {
      files: ['**/*.js', '**/*.mjs'],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  );
}
