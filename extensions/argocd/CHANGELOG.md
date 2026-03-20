# Argo CD CLI Extension Changelog

## 1.0.0

### Task Changes

* Removed hardcoded fallback version - version resolution failures now surface as explicit errors instead of silently installing a pinned release.
* Task fails early when `version` is set to `server` but no service connection is provided.
* Install Argo CD CLI directly from the connected server's download endpoint when `version` is set to `server`. Automatically falls back to the GitHub release if the server endpoint is not accessible.
* `ARGOCD_AUTH_TOKEN` pipeline variable is now set as a secret.

### Internal Changes

* Migrated to pnpm monorepo workspace.
* Switched build tooling from `tsc` to esbuild (bundled single-file output) and removing `node_modules` from the final vsix package.
* Replaced Jest with Vitest.
* Replaced ESLint+Prettier with Biome.
