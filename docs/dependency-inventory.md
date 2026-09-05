# Dependency upgrade inventory (updated September 5, 2026)

Recorded September 5, 2026 using Node v22.20.0 and npm 11.12.0.

`npm ls --depth=0 --json` reports no missing direct packages. A clean `npm ci` completed successfully with 702 packages; subsequent Next.js install/build activity can leave two optional native/WASM packages visible as workspace extras (`@emnapi/runtime` and `@img/sharp-wasm32`). `npm outdated --json` queried the npm registry successfully outside the sandbox after sandbox DNS resolution failed. Its exit code 1 indicates outdated packages, not a failed inventory.

The initial registry snapshot below has been reconciled with the upgraded manifest and lockfile. Existing gRPC additions in the manifest, lockfile and Next.js configuration were preserved. Runtime and tooling upgrades were applied in compatible groups without forced peer resolution; the resolved versions in `package-lock.json` are authoritative.

For packages absent from `npm outdated`, wanted/latest are recorded as the installed version because the registry-backed check did not report an available update. Re-query targets at upgrade time; registry results can change.

| Package | Group | Declared | Installed | Wanted | Latest | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `@better-auth/mongo-adapter` | runtime | `^1.7.2` | 1.7.2 | 1.7.2 | 1.7.2 | Upgraded |
| `@dnd-kit/core` | runtime | `^6.3.1` | 6.3.1 | 6.3.1 | 6.3.1 | Current |
| `@dnd-kit/sortable` | runtime | `^10.0.0` | 10.0.0 | 10.0.0 | 10.0.0 | Current |
| `@dnd-kit/utilities` | runtime | `^3.2.2` | 3.2.2 | 3.2.2 | 3.2.2 | Current |
| `@grpc/grpc-js` | runtime | `^1.14.4` | 1.14.4 | 1.14.4 | 1.14.4 | Current |
| `@grpc/proto-loader` | runtime | `^0.8.1` | 0.8.1 | 0.8.1 | 0.8.1 | Current |
| `@hookform/resolvers` | runtime | `^5.9.1` | 5.9.1 | 5.9.1 | 5.9.1 | Upgraded |
| `@radix-ui/react-accordion` | runtime | `^1.2.20` | 1.2.20 | 1.2.20 | 1.2.20 | Upgraded |
| `@radix-ui/react-alert-dialog` | runtime | `^1.1.23` | 1.1.23 | 1.1.23 | 1.1.23 | Upgraded |
| `@radix-ui/react-aspect-ratio` | runtime | `^1.1.15` | 1.1.15 | 1.1.15 | 1.1.15 | Upgraded |
| `@radix-ui/react-avatar` | runtime | `^1.2.6` | 1.2.6 | 1.2.6 | 1.2.6 | Upgraded |
| `@radix-ui/react-checkbox` | runtime | `^1.3.11` | 1.3.11 | 1.3.11 | 1.3.11 | Upgraded |
| `@radix-ui/react-collapsible` | runtime | `^1.1.20` | 1.1.20 | 1.1.20 | 1.1.20 | Upgraded |
| `@radix-ui/react-context-menu` | runtime | `^2.3.7` | 2.3.7 | 2.3.7 | 2.3.7 | Upgraded |
| `@radix-ui/react-dialog` | runtime | `^1.1.23` | 1.1.23 | 1.1.23 | 1.1.23 | Upgraded |
| `@radix-ui/react-dropdown-menu` | runtime | `^2.1.24` | 2.1.24 | 2.1.24 | 2.1.24 | Upgraded |
| `@radix-ui/react-hover-card` | runtime | `^1.1.23` | 1.1.23 | 1.1.23 | 1.1.23 | Upgraded |
| `@radix-ui/react-label` | runtime | `^2.1.15` | 2.1.15 | 2.1.15 | 2.1.15 | Upgraded |
| `@radix-ui/react-menubar` | runtime | `^1.1.24` | 1.1.24 | 1.1.24 | 1.1.24 | Upgraded |
| `@radix-ui/react-navigation-menu` | runtime | `^1.2.22` | 1.2.22 | 1.2.22 | 1.2.22 | Upgraded |
| `@radix-ui/react-popover` | runtime | `^1.1.23` | 1.1.23 | 1.1.23 | 1.1.23 | Upgraded |
| `@radix-ui/react-progress` | runtime | `^1.1.16` | 1.1.16 | 1.1.16 | 1.1.16 | Upgraded |
| `@radix-ui/react-radio-group` | runtime | `^1.4.7` | 1.4.7 | 1.4.7 | 1.4.7 | Upgraded |
| `@radix-ui/react-scroll-area` | runtime | `^1.2.18` | 1.2.18 | 1.2.18 | 1.2.18 | Upgraded |
| `@radix-ui/react-select` | runtime | `^2.3.7` | 2.3.7 | 2.3.7 | 2.3.7 | Upgraded |
| `@radix-ui/react-separator` | runtime | `^1.1.15` | 1.1.15 | 1.1.15 | 1.1.15 | Upgraded |
| `@radix-ui/react-slider` | runtime | `^1.4.7` | 1.4.7 | 1.4.7 | 1.4.7 | Upgraded |
| `@radix-ui/react-slot` | runtime | `^1.3.3` | 1.3.3 | 1.3.3 | 1.3.3 | Upgraded |
| `@radix-ui/react-switch` | runtime | `^1.3.7` | 1.3.7 | 1.3.7 | 1.3.7 | Upgraded |
| `@radix-ui/react-tabs` | runtime | `^1.1.21` | 1.1.21 | 1.1.21 | 1.1.21 | Upgraded |
| `@radix-ui/react-toast` | runtime | `^1.2.23` | 1.2.23 | 1.2.23 | 1.2.23 | Upgraded |
| `@radix-ui/react-toggle` | runtime | `^1.1.18` | 1.1.18 | 1.1.18 | 1.1.18 | Upgraded |
| `@radix-ui/react-toggle-group` | runtime | `^1.1.19` | 1.1.19 | 1.1.19 | 1.1.19 | Upgraded |
| `@radix-ui/react-tooltip` | runtime | `^1.2.16` | 1.2.16 | 1.2.16 | 1.2.16 | Upgraded |
| `@tanstack/react-query` | runtime | `^5.102.8` | 5.102.8 | 5.102.8 | 5.102.8 | Upgraded |
| `@types/jsonwebtoken` | runtime | `^9.0.10` | 9.0.10 | 9.0.10 | 9.0.10 | Current |
| `@vercel/analytics` | runtime | `^2.0.1` | 2.0.1 | 2.0.1 | 2.0.1 | Upgraded |
| `@vercel/blob` | runtime | `^2.8.0` | 2.8.0 | 2.8.0 | 2.8.0 | Upgraded |
| `@vercel/speed-insights` | runtime | `^2.0.0` | 2.0.0 | 2.0.0 | 2.0.0 | Upgraded |
| `axios` | runtime | `^1.20.0` | 1.20.0 | 1.20.0 | 1.20.0 | Upgraded |
| `baseline-browser-mapping` | runtime | `^2.11.21` | 2.11.21 | 2.11.21 | 2.11.21 | Upgraded |
| `bcryptjs` | runtime | `^3.0.3` | 3.0.3 | 3.0.3 | 3.0.3 | Current |
| `better-auth` | runtime | `^1.7.2` | 1.7.2 | 1.7.2 | 1.7.2 | Upgraded |
| `caniuse-lite` | runtime | `^1.0.30001810` | 1.0.30001810 | 1.0.30001810 | 1.0.30001810 | Upgraded |
| `class-variance-authority` | runtime | `^0.7.1` | 0.7.1 | 0.7.1 | 0.7.1 | Current |
| `clsx` | runtime | `^2.1.1` | 2.1.1 | 2.1.1 | 2.1.1 | Current |
| `cmdk` | runtime | `^1.1.1` | 1.1.1 | 1.1.1 | 1.1.1 | Current |
| `date-fns` | runtime | `^4.4.0` | 4.4.0 | 4.4.0 | 4.4.0 | Upgraded |
| `embla-carousel-react` | runtime | `^8.6.0` | 8.6.0 | 8.6.0 | 8.6.0 | Current |
| `gsap` | runtime | `^3.15.0` | 3.15.0 | 3.15.0 | 3.15.0 | Current |
| `input-otp` | runtime | `^1.5.0` | 1.5.0 | 1.5.0 | 1.5.0 | Upgraded |
| `jsonwebtoken` | runtime | `^9.0.3` | 9.0.3 | 9.0.3 | 9.0.3 | Current |
| `lenis` | runtime | `^1.3.26` | 1.3.26 | 1.3.26 | 1.3.26 | Current |
| `lucide-react` | runtime | `^1.41.0` | 1.41.0 | 1.41.0 | 1.41.0 | Upgraded |
| `mongodb` | runtime | `^7.6.0` | 7.6.0 | 7.6.0 | 7.6.0 | Upgraded |
| `motion` | runtime | `^13.2.0` | 13.2.0 | 13.2.0 | 13.2.0 | Upgraded |
| `next` | runtime | `^16.3.4` | 16.3.4 | 16.3.4 | 16.3.4 | Upgraded |
| `next-themes` | runtime | `^0.4.6` | 0.4.6 | 0.4.6 | 0.4.6 | Current |
| `nodemailer` | runtime | `^10.0.0` | 10.0.0 | 10.0.0 | 10.0.0 | Upgraded |
| `opencode-ai` | runtime | `^1.18.28` | 1.18.28 | 1.18.28 | 1.18.28 | Upgraded |
| `react` | runtime | `^19.2.8` | 19.2.8 | 19.2.8 | 19.2.8 | Upgraded |
| `react-day-picker` | runtime | `^10.0.1` | 10.0.1 | 10.0.1 | 10.0.1 | Upgraded |
| `react-dom` | runtime | `^19.2.8` | 19.2.8 | 19.2.8 | 19.2.8 | Upgraded |
| `react-glass-ui` | runtime | `^1.2.2` | 1.2.2 | 1.2.2 | 1.2.2 | Current |
| `react-hook-form` | runtime | `^7.87.0` | 7.87.0 | 7.87.0 | 7.87.0 | Upgraded |
| `react-resizable-panels` | runtime | `^4.12.3` | 4.12.3 | 4.12.3 | 4.12.3 | Upgraded |
| `react-router-dom` | runtime | `^7.18.3` | 7.18.3 | 7.18.3 | 7.18.3 | Upgraded |
| `recharts` | runtime | `^3.10.1` | 3.10.1 | 3.10.1 | 3.10.1 | Upgraded |
| `sonner` | runtime | `^2.0.8` | 2.0.8 | 2.0.8 | 2.0.8 | Upgraded |
| `tailwind-merge` | runtime | `^3.6.0` | 3.6.0 | 3.6.0 | 3.6.0 | Upgraded |
| `tailwindcss-animate` | runtime | `^1.0.7` | 1.0.7 | 1.0.7 | 1.0.7 | Current |
| `vaul` | runtime | `^1.1.2` | 1.1.2 | 1.1.2 | 1.1.2 | Current |
| `zod` | runtime | `^4.5.4` | 4.5.4 | 4.5.4 | 4.5.4 | Upgraded |
| `@eslint/js` | development | `^10.0.1` | 10.0.1 | 10.0.1 | 10.0.1 | Upgraded |
| `@tailwindcss/postcss` | development | `^4.3.3` | 4.3.3 | 4.3.3 | 4.3.3 | Upgraded |
| `@tailwindcss/typography` | development | `^0.5.20` | 0.5.20 | 0.5.20 | 0.5.20 | Upgraded |
| `@testing-library/jest-dom` | development | `^7.0.1` | 7.0.1 | 7.0.1 | 7.0.1 | Upgraded |
| `@testing-library/react` | development | `^16.3.3` | 16.3.3 | 16.3.3 | 16.3.3 | Upgraded |
| `@types/node` | development | `^22.20.1` | 22.20.1 | 22.20.1 | 26.4.1 | Aligned to Node 22 runtime |
| `@types/nodemailer` | development | `^8.0.1` | 8.0.1 | 8.0.1 | 8.0.1 | Upgraded |
| `@types/react` | development | `^19.2.18` | 19.2.18 | 19.2.18 | 19.2.18 | Upgraded |
| `@types/react-dom` | development | `^19.2.7` | 19.2.7 | 19.2.7 | 19.2.7 | Upgraded |
| `@vitejs/plugin-react-swc` | development | `^4.3.3` | 4.3.3 | 4.3.3 | 4.3.3 | Upgraded |
| `autoprefixer` | development | `^10.5.5` | 10.5.5 | 10.5.5 | 10.5.5 | Upgraded |
| `eslint` | development | `^10.10.0` | 10.10.0 | 10.10.0 | 10.10.0 | Upgraded |
| `eslint-plugin-react-hooks` | development | `^7.1.1` | 7.1.1 | 7.1.1 | 7.1.1 | Upgraded |
| `eslint-plugin-react-refresh` | development | `^0.5.6` | 0.5.6 | 0.5.6 | 0.5.6 | Upgraded |
| `globals` | development | `^17.12.0` | 17.12.0 | 17.12.0 | 17.12.0 | Upgraded |
| `jsdom` | development | `^29.1.1` | 29.1.1 | 29.1.1 | 29.1.1 | Upgraded |
| `lovable-tagger` | development | `^1.3.3` | 1.3.3 | 1.3.3 | 1.3.3 | Upgraded |
| `postcss` | development | `^8.5.28` | 8.5.28 | 8.5.28 | 8.5.28 | Upgraded |
| `tailwindcss` | development | `^4.3.3` | 4.3.3 | 4.3.3 | 4.3.3 | Upgraded |
| `typescript` | development | `^6.0.3` | 6.0.3 | 6.0.3 | 7.0.2 | Upgraded within typescript-eslint peer range |
| `typescript-eslint` | development | `^8.69.0` | 8.69.0 | 8.69.0 | 8.69.0 | Upgraded |
| `vite` | development | `^8.2.2` | 8.2.2 | 8.2.2 | 8.2.2 | Upgraded |
| `vitest` | development | `^4.1.11` | 4.1.11 | 4.1.11 | 5.0.0 | Held: Better Auth peer range |

Inventory covers 96 direct packages; 79 entries were reported outdated before the declaration-only builder package was removed.

## Upgrade validation and explicit holds

1. TypeScript 7.0.2 is held at 6.0.3 because `typescript-eslint@8.69.0` declares `typescript >=4.8.4 <6.1.0`; 6.0.3 is the latest stable release inside that peer range.
2. Vitest 5.0.0 is held at 4.1.11 because Better Auth 1.7.2 declares an optional Vitest peer range ending at 4.x. No forced peer resolution was used.
3. `@types/node` is pinned to the latest Node 22 line (22.20.1) to match the supported Node v22.20.0 runtime; 26.4.1 is the registry latest but targets a newer Node API surface.
4. Next.js 16.3.4 retains the explicit Webpack scripts and the existing gRPC `serverExternalPackages` configuration. React Day Picker 10, Recharts 3, ESLint 10 and Nodemailer 10 migrations are included in source changes.
5. The declaration-only `@vercel/node` dependency was removed after verifying that every source/test import was type-only and that no script or build configuration consumed its runtime. `src/backend/api/lib/http.ts` aliases Next.js's documented `NextApiRequest` and `NextApiResponse` as `VercelRequest` and `VercelResponse`, preserving existing handler names without a Vercel builder dependency.
6. The non-major `npm audit fix` plan was applied before the removal, upgrading the safe transitive `humanfs`, `brace-expansion`, `postcss-selector-parser`, `tar` and non-Vercel `undici` paths. `npm audit` is now clean with 0 advisories. Peer checks, lint, typechecking, tests, build and runtime regression flows remain release checks for the parent integration.
