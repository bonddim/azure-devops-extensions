# Deprecating the Terramate and Argo CD extensions

Date: 2026-09-12
Status: Approved for planning

## Goal

Consolidate tool-installer tasks into the **Toolbox** extension:

1. Deprecate the **Terramate** extension outright; its replacement is the existing
   `GitHubToolInstaller` task in Toolbox.
2. Migrate the **Argo CD CLI installer** into Toolbox under a new task id and name, then deprecate
   the standalone Argo CD extension.
3. Update every affected README so the migration path is discoverable from the Marketplace listing
   and from the repository.

Both old extensions stay published through a deprecation window. Nothing is unpublished or deleted
in this change.

## Background

Three extensions each ship their own installer task:

| Extension | Task | Notes |
| --- | --- | --- |
| `argocd` | `ArgoCDInstaller` | Also contributes an `ArgoCDServer` service endpoint type |
| `terramate` | `TerramateInstaller` | Thin wrapper over a GitHub release download |
| `toolbox` | `GitHubToolInstaller` | Generic: resolves any GitHub release asset via Octokit |

`GitHubToolInstaller` subsumes `TerramateInstaller` entirely, so the Terramate extension has no
reason to exist. The Argo CD task does not generalise — it resolves the version from a live Argo CD
server, reads a service connection, and exports `ARGOCD_*` variables — so it moves to Toolbox as a
dedicated task rather than being replaced.

### Constraints discovered during design

- **`task.json` supports first-class deprecation.** `deprecated`, `deprecationMessage`, and
  `removalDate` are all in the published task schema. Deprecated tasks collapse into a separate
  section at the end of the task picker, and the agent emits a deprecation warning that includes the
  removal date. No custom runtime warning is needed.
- **Task names are collection-global.** Two installed extensions cannot both contribute a task named
  `ArgoCDInstaller`. The migrated task therefore needs a new name *and* a new GUID.
- **Service endpoint type names are collection-global too.** Toolbox cannot reuse the
  `ArgoCDServer` endpoint type name while the old extension may still be installed.
- **`GitHubToolInstaller` requires GitHub authentication**; `TerramateInstaller` requires none. This
  is a genuine regression for Terramate users and is documented explicitly rather than glossed over.
  Relaxing the auth requirement was considered and deliberately deferred.
- `extensions/terramate/tasks/TerramateInstaller` is absent from the root `tsconfig.json`
  references, so it is not type-checked today.
- `docs/` contains only untracked VitePress build output. There is no documentation source to
  update; READMEs are the documentation.

## Design

### 1. New Toolbox task: `ArgoCDCliInstaller`

Create `extensions/toolbox/tasks/ArgoCDCliInstaller/` by copying
`extensions/argocd/tasks/ArgoCDInstaller/` (`src/`, `tests/`, `tsconfig.json`, `icon.png`). Copy
rather than move: the old task remains published for the duration of its deprecation window.

`task.json` changes relative to the original:

| Field | Value |
| --- | --- |
| `id` | `01636f80-2279-4e42-9bd1-e7020cf77294` (new) |
| `name` | `ArgoCDCliInstaller` |
| `friendlyName` | `Argo CD CLI Installer` (unchanged from the old task) |
| `version` | `0.1.0` — major stays 0, so YAML references `ArgoCDCliInstaller@0` |
| `connection` input `type` | `connectedService:ArgoCDServerConnection` |
| `helpUrl` / `helpMarkDown` | point at the Toolbox task README |

Everything else is unchanged: the same three inputs, the same `restrictions.settableVariables`
allow-list (`PATH`, `ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`, `ARGOCD_OPTS`), and the same
`Node24`/`Node20_1` execution handlers.

**No behaviour change in `run.ts`.** Version resolution (`latest` / `server` / explicit), the server
download endpoint with its GitHub fallback on non-2xx responses, and the exported environment
variables all carry over as-is. The task is moved, not rewritten.

The `friendlyName` intentionally matches the deprecated task's. With both extensions installed the
picker shows two identically-named entries, but the deprecated one sits in the collapsed deprecated
section, so the visible entry is unambiguous. Keeping the name stable means users searching the
picker for "Argo CD" find the supported task under the name they already know.

Add the new task to the root `tsconfig.json` references.

### 2. Toolbox contributes the Argo CD service endpoint

`extensions/toolbox/vss-extension.js` currently relies on `buildManifest()` to generate its
`contributions` array from `tasks/*/task.json`. It must now append an endpoint contribution while
preserving the generated task contributions:

```js
contributions: [
  ...base.contributions,
  {
    id: 'argocd-service-endpoint',
    type: 'ms.vss-endpoint.service-endpoint-type',
    targets: ['ms.vss-endpoint.endpoint-types'],
    properties: {
      name: 'ArgoCDServerConnection',
      displayName: 'Argo CD Server',
      url: {
        displayName: 'Argo CD Server URL',
        helpText: 'URL for the Argo CD Server to connect to.',
      },
      authenticationSchemes: [{ type: 'ms.vss-endpoint.endpoint-auth-scheme-token' }],
    },
  },
]
```

The internal name differs from the argocd extension's `ArgoCDServer` so both extensions can be
installed simultaneously. The user-facing `displayName` is unchanged.

**Migration cost for users:** one new service connection must be created under the new type. This is
the only manual step; everything else is a task-name swap in YAML.

### 3. Deprecate both old tasks

Add to `extensions/terramate/tasks/TerramateInstaller/task.json` and
`extensions/argocd/tasks/ArgoCDInstaller/task.json`:

For `TerramateInstaller`:

```jsonc
"deprecated": true,
"deprecationMessage": "TerramateInstaller is deprecated. Use GitHubToolInstaller@0 from the Toolbox extension with repository 'terramate-io/terramate'. It requires a GitHub service connection or a GITHUB_TOKEN variable.",
"removalDate": "2027-01-31"
```

For `ArgoCDInstaller`:

```jsonc
"deprecated": true,
"deprecationMessage": "ArgoCDInstaller is deprecated. Use ArgoCDCliInstaller@0 from the Toolbox extension. You must recreate your Argo CD service connection under the Toolbox endpoint type.",
"removalDate": "2027-01-31"
```

Bump each task's minor version so the deprecation metadata actually ships. The removal date is
roughly four and a half months out and appears verbatim in the agent's warning.

No `taskLib.warning()` call is added. The platform already warns on a deprecated task with a removal
date; a second warning in the build log is noise.

### 4. Replacement usage, verified

The `GitHubToolInstaller` asset matcher was checked against the real
`terramate-io/terramate` release listing (v0.17.3, 30 assets). On linux x64, linux arm64, windows
x64, and darwin arm64 it narrows to exactly one asset: the platform/arch filter admits the `.deb`,
`.rpm`, and `.sig` siblings, and the archive-extension preference (`.tar.gz` / `.zip`) eliminates
them. **No `filePattern` is required.**

So the Terramate replacement is:

```yaml
- task: GitHubToolInstaller@0
  inputs:
    connection: my-github-connection
    repository: terramate-io/terramate
    version: latest
```

versus the deprecated:

```yaml
- task: TerramateInstaller@0
  inputs:
    version: latest
```

The added `connection` input is mandatory — `GitHubToolInstaller` fails without either a GitHub
service connection or a `GITHUB_TOKEN` variable. Every Terramate deprecation notice must say so.

### 5. README updates

| File | Change |
| --- | --- |
| `README.md` (root) | List all three extensions; mark Argo CD and Terramate as deprecated. Currently lists only Argo CD. |
| `extensions/terramate/README.md` | Deprecation callout: removal date, replacement, GitHub auth requirement |
| `extensions/terramate/tasks/TerramateInstaller/README.md` | Same callout plus before/after YAML |
| `extensions/argocd/README.md` | Deprecation callout: removal date, replacement |
| `extensions/argocd/tasks/ArgoCDInstaller/README.md` | Same callout plus before/after YAML and the service-connection recreation step |
| `extensions/toolbox/README.md` | Add `ArgoCDCliInstaller` to the task list |
| `extensions/toolbox/tasks/ArgoCDCliInstaller/README.md` | New. Adapted from the argocd task README, plus a "Migrating from ArgoCDInstaller@0" section |

Deprecation callouts lead with the removal date and the replacement task, in that order. A reader
who stops after one sentence should know the task is going away and what to use instead.

### 6. Versioning and release

A single changeset covering:

- `toolbox` — **minor**: new task, new endpoint contribution
- `argocd` — **patch**: deprecation metadata, README
- `terramate` — **patch**: deprecation metadata, README

CI publishes all three. Nothing is unpublished.

## Testing

- Copy the existing Argo CD test suite to the new task;
  `pnpm --filter ./extensions/toolbox exec vitest run` passes with no changes to assertions.
- `pnpm test` across the workspace.
- `pnpm typecheck`. This newly covers `TerramateInstaller`, which is added to the root tsconfig
  references. Any pre-existing errors it surfaces are reported, not silently absorbed into this
  change.
- `node extensions/toolbox/vss-extension.js` — confirm the generated manifest lists both task
  contributions *and* the endpoint contribution.
- `pnpm biome check --fix`.

## Follow-up work (not in this change)

Tracked as a separate issue, to be done after `2027-01-31`:

- Delete `extensions/terramate/` and `extensions/argocd/`.
- Remove their root `tsconfig.json` references.
- Unpublish both extensions from the Marketplace.

## Decisions deliberately deferred

- **Making GitHub authentication optional in `GitHubToolInstaller`.** Would make it a true drop-in
  for `TerramateInstaller`, at the cost of a 60 req/hr unauthenticated rate limit. Out of scope here;
  the auth requirement is documented instead.
- **Generalising the Argo CD task.** It moves to Toolbox unchanged. Rewriting it on top of
  `GitHubToolInstaller` internals would couple two tasks that have different version-resolution
  semantics.
