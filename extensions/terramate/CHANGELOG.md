# Terramate Extension Changelog

## 1.0.0

### Task Changes

* Removed hardcoded fallback version - version resolution failures now surface as explicit errors instead of silently installing a pinned release.

### Internal Changes

* Migrated to pnpm monorepo workspace.
* Switched build tooling from `tsc` to esbuild (bundled single-file output) and removing `node_modules` from the final vsix package.
* Added Vitest for testing.
* Added Biome for linting and formatting.
