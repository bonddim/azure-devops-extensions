# Terramate Extension Changelog

## 1.1.0

### Minor Changes

- 2e63395: deprecated: TerramateInstaller is deprecated and will be removed after 2027-01-31. Follow the migration guide https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/terramate/README.md#migration.

### Patch Changes

- 93113f4: chore: update dependencies

## 1.0.2

### Patch Changes

- f17f8a1: fix: include libs default messages in lib.json

## 1.0.1

### Patch Changes

- dbd4121: fix: use previous task contributions ids

## 1.0.0

### Task Changes

- Removed hardcoded fallback version - version resolution failures now surface as explicit errors instead of silently installing a pinned release.

### Internal Changes

- Migrated to pnpm monorepo workspace.
- Switched build tooling from `tsc` to esbuild (bundled single-file output) and removing `node_modules` from the final vsix package.
- Added Vitest for testing.
- Added Biome for linting and formatting.
