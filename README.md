# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Notable dependencies

- **`xlsx` (SheetJS)** is installed from SheetJS's own CDN tarball (`https://cdn.sheetjs.com/xlsx-latest/xlsx-latest.tgz`), not the plain npm registry — the registry's latest publish has two unpatched vulnerabilities that SheetJS fixed but never re-published to npm under this name. See the comment above the `import * as XLSX` in `src/lib/import/parseFile.ts` for the full explanation. Don't revert `package.json`'s `xlsx` entry to a normal `"^x.y.z"` version without reading that first.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Deploying database changes

The live database has been changed by hand in the past, so the migration history on live and the files in `supabase/migrations` can disagree. Some old migrations would now undo security fixes if they were replayed (see `supabase/migration-history-audit.md`).

- **Never run `supabase db push` until `npx supabase migration list --linked` shows nothing pending.** `db push` applies every pending file, not just the one you meant.
- Applying a single migration safely:
  1. Read the file. Check it against the live objects it touches (`npx supabase db query --linked "select ..."`, read-only).
  2. Run just that file: `npx supabase db query --linked -f supabase/migrations/<version>_<name>.sql` (or paste it in the SQL editor). Keep it in one transaction (`BEGIN; ... COMMIT;`) so a failure leaves nothing half applied.
  3. Record it: `npx supabase migration repair --status applied <version> --linked`.
  4. Check `npx supabase migration list --linked`: local and remote columns should match for that version.
- If you change the live database by hand, put the same SQL in a migration file in the same change and record it with step 3, so the two never drift again.
- Never edit a migration that has already been applied; add a new one.
