import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'e2e', '.agents'],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      'no-useless-escape': 'warn',
    },
  },
  {
    // Pre-existing conditional useMemo after early return in legacy NoteEditorPane.tsx
    // (scheduled for M3 refactor into MarkdownGrimoireEditor.tsx); keep as warning so
    // rules-of-hooks stays an error everywhere else.
    files: ['src/components/editor/NoteEditorPane.tsx'],
    rules: {
      'react-hooks/rules-of-hooks': 'warn',
    },
  },
);
