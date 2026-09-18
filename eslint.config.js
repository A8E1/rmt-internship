import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['tests/**', 'scripts/**', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['js/*.js', 'sw.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, reportError: 'off' } },
    // Legacy files share globals and HTML inline handlers; module rules stay strict.
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-useless-escape': 'off',
    },
  },
  { files: ['sw.js'], languageOptions: { globals: globals.serviceworker } },
];
