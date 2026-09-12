# Extension Deprecation & Argo CD Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Argo CD CLI installer into the Toolbox extension under a new id/name/endpoint type, and mark the standalone Argo CD and Terramate extensions deprecated with a removal date.

**Architecture:** The Argo CD task is *copied* (not moved) into `extensions/toolbox/tasks/ArgoCDCliInstaller/` with zero behaviour change — only the task id, name, and `connectedService:` input type differ. Toolbox's manifest gains an Argo CD service endpoint contribution under a new collection-global name. The two old tasks get `deprecated`/`deprecationMessage`/`removalDate` metadata and README callouts, but stay published until 2027-01-31.

**Tech Stack:** TypeScript (CommonJS, `target: es2022`), pnpm workspaces, vitest, Biome, esbuild, `tfx-cli`, changesets, Azure Pipelines task/tool libs.

**Spec:** `docs/superpowers/specs/2026-09-12-extension-deprecation-design.md`

## Global Constraints

Copied verbatim from the spec — these apply to every task below.

- **Removal date (both deprecated tasks):** `2027-01-31`
- **New task id (ArgoCDCliInstaller):** `01636f80-2279-4e42-9bd1-e7020cf77294`
- **New task name:** `ArgoCDCliInstaller`; **friendlyName:** `Argo CD CLI Installer` (intentionally identical to the deprecated task's)
- **New task version:** Major `0`, Minor `1`, Patch `0` — major stays 0 so YAML references `ArgoCDCliInstaller@0`
- **New endpoint type internal name:** `ArgoCDServerConnection`; **displayName:** `Argo CD Server`
- **New endpoint contribution id:** `argocd-service-endpoint`
- **No behaviour change** in the migrated `run.ts`. Version resolution (`latest`/`server`/explicit), the server-download-with-GitHub-fallback, and the exported `ARGOCD_*` variables carry over byte-for-byte.
- **No `taskLib.warning()` deprecation call** is added anywhere. The agent already warns on a deprecated task with a removal date.
- **Nothing is unpublished or deleted** in this plan. Both old extensions keep shipping.
- **Code style (Biome, enforced by pre-commit hook):** no semicolons, single quotes, 120-char line width, 2-space indent, trailing commas, LF endings.
- **Changeset package names come from `package.json` `name` fields, not directory names:** `toolbox`, `terramate`, and `argo-cd-cli-extension` (NOT `argocd`).
- **Do not commit `.claude/` or `CLAUDE.md`.** They are untracked and out of scope.

## Starting State

The working tree has an **in-progress README restructure by the repo owner** that this plan builds on:

- `extensions/{argocd,terramate,toolbox}/README.md` — modified, slimmed to a short intro + a `## Tasks` link list
- `extensions/*/tasks/*/README.md` — three **untracked** new files holding the detailed content moved out of the above
- `biome.jsonc` — modified, `$schema` bumped to 2.5.12

Task 1 commits this as a baseline so the deprecation work does not tangle with it.

**Pre-verified facts** (checked during planning — do not re-litigate):

- `pnpm typecheck` passes cleanly once `extensions/terramate/tasks/TerramateInstaller` is added to the root tsconfig references. No latent errors surface.
- `GitHubToolInstaller`'s asset matcher resolves `terramate-io/terramate` to exactly one asset on linux x64, linux arm64, windows x64, and darwin arm64. **No `filePattern` is needed** in the migration docs.
- `extensions/toolbox/tasks/GitHubToolInstaller/src/run.ts` has 2 pre-existing `noNonNullAssertion` Biome **warnings** (lines 78 and 166). They do not block commits. Leave them alone.

---

### Task 1: Commit the pending README restructure as a baseline

**Files:**
- Modify (commit as-is): `biome.jsonc`, `extensions/argocd/README.md`, `extensions/terramate/README.md`, `extensions/toolbox/README.md`
- Create (commit as-is): `extensions/argocd/tasks/ArgoCDInstaller/README.md`, `extensions/terramate/tasks/TerramateInstaller/README.md`, `extensions/toolbox/tasks/GitHubToolInstaller/README.md`

**Interfaces:**
- Consumes: nothing
- Produces: a clean working tree, and per-task README files that Tasks 5-7 edit

This is the repo owner's own work-in-progress, already complete and internally consistent: extension READMEs became short index pages, and their detailed content moved into new per-task READMEs. Committing it separately keeps the deprecation diff readable.

- [ ] **Step 1: Confirm the working tree matches the expected starting state**

```bash
git status --short
```

Expected exactly (order may vary):
```
 M biome.jsonc
 M extensions/argocd/README.md
 M extensions/terramate/README.md
 M extensions/toolbox/README.md
?? .claude/
?? CLAUDE.md
?? extensions/argocd/tasks/ArgoCDInstaller/README.md
?? extensions/terramate/tasks/TerramateInstaller/README.md
?? extensions/toolbox/tasks/GitHubToolInstaller/README.md
```

If anything else appears, STOP and report it rather than committing.

- [ ] **Step 2: Stage only the README restructure and the biome schema bump**

```bash
git add biome.jsonc \
  extensions/argocd/README.md \
  extensions/terramate/README.md \
  extensions/toolbox/README.md \
  extensions/argocd/tasks/ArgoCDInstaller/README.md \
  extensions/terramate/tasks/TerramateInstaller/README.md \
  extensions/toolbox/tasks/GitHubToolInstaller/README.md
```

- [ ] **Step 3: Verify `.claude/` and `CLAUDE.md` are NOT staged**

```bash
git diff --cached --name-only
```

Expected: exactly the 7 files from Step 2. If `.claude/` or `CLAUDE.md` appear, unstage them with `git restore --staged .claude CLAUDE.md`.

- [ ] **Step 4: Commit**

```bash
git commit -m "docs: split extension READMEs into per-task READMEs

Extension READMEs become short index pages; detailed task documentation
moves into tasks/<Name>/README.md. Also bumps the Biome schema to 2.5.12.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Add TerramateInstaller to root tsconfig references

**Files:**
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: nothing
- Produces: `TerramateInstaller` is type-checked by `pnpm typecheck`

`extensions/terramate/tasks/TerramateInstaller` has its own `tsconfig.json` but was never listed in the root references, so `tsc --build` skips it. Fixing this before deprecating the task means the deprecation edit lands on type-checked code.

- [ ] **Step 1: Verify the gap exists**

```bash
grep -c TerramateInstaller tsconfig.json
```

Expected: `0`

- [ ] **Step 2: Add the reference**

Edit `tsconfig.json` so the `references` array reads exactly:

```json
{
  "extends": "./tsconfig.options.json",
  "files": [],
  "references": [
    {
      "path": "packages/utils"
    },
    {
      "path": "extensions/argocd/tasks/ArgoCDInstaller"
    },
    {
      "path": "extensions/terramate/tasks/TerramateInstaller"
    },
    {
      "path": "extensions/toolbox/tasks/GitHubToolInstaller"
    }
  ]
}
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS, no output beyond the `tsc --build --emitDeclarationOnly` banner. (Pre-verified during planning — if errors appear, something else changed; report rather than patching around it.)

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json
git commit -m "build: type-check the TerramateInstaller task

The task had a tsconfig but was missing from the root project references,
so tsc --build skipped it entirely.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Create the ArgoCDCliInstaller task in Toolbox

**Files:**
- Create: `extensions/toolbox/tasks/ArgoCDCliInstaller/task.json`
- Create: `extensions/toolbox/tasks/ArgoCDCliInstaller/tsconfig.json`
- Create: `extensions/toolbox/tasks/ArgoCDCliInstaller/src/index.ts` (copied)
- Create: `extensions/toolbox/tasks/ArgoCDCliInstaller/src/run.ts` (copied, unmodified)
- Create: `extensions/toolbox/tasks/ArgoCDCliInstaller/tests/run.test.ts` (copied, unmodified)
- Create: `extensions/toolbox/tasks/ArgoCDCliInstaller/icon.png` (copied)
- Modify: `tsconfig.json`

**Interfaces:**
- Consumes: `@bonddim/utils` (`getLatestVersion`, `installTool`, `isWindows`, `isHttpError`) — unchanged from the original task
- Produces: task `ArgoCDCliInstaller` whose `connection` input has type `connectedService:ArgoCDServerConnection`. Task 4 registers that endpoint type; Task 7 documents the task.

The test file imports from `'../src/run'` and mocks `@bonddim/utils` by module path, so it runs unmodified after the copy. Do not edit it.

- [ ] **Step 1: Copy the task directory (source, tests, icon, tsconfig — not dist/)**

```bash
mkdir -p extensions/toolbox/tasks/ArgoCDCliInstaller
cp -r extensions/argocd/tasks/ArgoCDInstaller/src \
      extensions/argocd/tasks/ArgoCDInstaller/tests \
      extensions/argocd/tasks/ArgoCDInstaller/icon.png \
      extensions/argocd/tasks/ArgoCDInstaller/tsconfig.json \
      extensions/toolbox/tasks/ArgoCDCliInstaller/
ls -R extensions/toolbox/tasks/ArgoCDCliInstaller
```

Expected: `icon.png  src  tests  tsconfig.json`, with `src/{index.ts,run.ts}` and `tests/run.test.ts`. There must be **no** `dist/` and **no** `tsconfig.tsbuildinfo`.

- [ ] **Step 2: Write the new `task.json`**

Create `extensions/toolbox/tasks/ArgoCDCliInstaller/task.json` with exactly this content:

```json
{
  "$schema": "https://raw.githubusercontent.com/Microsoft/azure-pipelines-task-lib/master/tasks.schema.json",
  "id": "01636f80-2279-4e42-9bd1-e7020cf77294",
  "name": "ArgoCDCliInstaller",
  "friendlyName": "Argo CD CLI Installer",
  "description": "Install Argo CD CLI on pipeline agents",
  "helpUrl": "https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/toolbox/tasks/ArgoCDCliInstaller/README.md",
  "helpMarkDown": "[Learn more about this task](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/toolbox/tasks/ArgoCDCliInstaller/README.md)",
  "category": "Azure Pipelines",
  "author": "Dmytro Bondar",
  "version": {
    "Major": 0,
    "Minor": 1,
    "Patch": 0
  },
  "minimumAgentVersion": "3.232.1",
  "instanceNameFormat": "Install Argo CD CLI",
  "inputs": [
    {
      "name": "connection",
      "type": "connectedService:ArgoCDServerConnection",
      "label": "Argo CD Server Connection",
      "defaultValue": "",
      "required": false,
      "helpMarkDown": "Select the Argo CD Server Connection to use"
    },
    {
      "name": "version",
      "type": "string",
      "label": "Argo CD CLI Version",
      "defaultValue": "latest",
      "required": false,
      "helpMarkDown": "Version of Argo CD CLI to install. If not specified, latest will be installed"
    },
    {
      "name": "options",
      "type": "string",
      "label": "ArgoCD CLI Options",
      "required": false,
      "helpMarkDown": "Specify arguments for **ARGOCD_OPTS** variable, eg. `--grpc-web --insecure`"
    }
  ],
  "restrictions": {
    "commands": {
      "mode": "restricted"
    },
    "settableVariables": {
      "allowed": ["PATH", "ARGOCD_SERVER", "ARGOCD_AUTH_TOKEN", "ARGOCD_OPTS"]
    }
  },
  "execution": {
    "Node24": {
      "target": "dist/index.js"
    },
    "Node20_1": {
      "target": "dist/index.js"
    }
  }
}
```

- [ ] **Step 3: Confirm `run.ts` was copied unmodified**

```bash
diff extensions/argocd/tasks/ArgoCDInstaller/src/run.ts \
     extensions/toolbox/tasks/ArgoCDCliInstaller/src/run.ts && echo "IDENTICAL"
diff extensions/argocd/tasks/ArgoCDInstaller/tests/run.test.ts \
     extensions/toolbox/tasks/ArgoCDCliInstaller/tests/run.test.ts && echo "TESTS IDENTICAL"
```

Expected: `IDENTICAL` and `TESTS IDENTICAL`. The spec requires zero behaviour change; any diff here is a bug.

- [ ] **Step 4: Run the Toolbox test suite**

```bash
pnpm --filter ./extensions/toolbox exec vitest run --no-color
```

Expected: PASS. Both `GitHubToolInstaller` and the new `ArgoCDCliInstaller` suites run; the Argo CD assertions pass unchanged because the task's behaviour is identical.

- [ ] **Step 5: Add the new task to root tsconfig references**

Edit `tsconfig.json` to add, after the `extensions/argocd/tasks/ArgoCDInstaller` entry:

```json
    {
      "path": "extensions/toolbox/tasks/ArgoCDCliInstaller"
    },
```

- [ ] **Step 6: Typecheck and build**

```bash
pnpm typecheck && pnpm --filter ./extensions/toolbox run build
```

Expected: typecheck PASSES; esbuild emits `extensions/toolbox/tasks/ArgoCDCliInstaller/dist/index.js`.

Filter the package directly rather than using `PNPM_BASE`: the selective-build scripts compare
*committed* state, and this task's files are still uncommitted. Task 4 needs this `dist/` directory to
exist, because `buildManifest()` writes `lib.json` into every task's `dist/` and throws if one is missing.

```bash
test -f extensions/toolbox/tasks/ArgoCDCliInstaller/dist/index.js && echo "dist OK"
```

Expected: `dist OK`

- [ ] **Step 7: Commit**

```bash
git add extensions/toolbox/tasks/ArgoCDCliInstaller tsconfig.json
git commit -m "feat(toolbox): add ArgoCDCliInstaller task

Migrates the Argo CD CLI installer into Toolbox under a new task id and
name so it can coexist with the deprecated argocd extension. Behaviour is
unchanged; only the id, name, and connectedService input type differ.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Contribute the Argo CD service endpoint from Toolbox

**Files:**
- Modify: `extensions/toolbox/vss-extension.js`

**Interfaces:**
- Consumes: `buildManifest()` from `tools/build-manifest.js`, which returns a `contributions` array auto-generated from `tasks/*/task.json` (contribution id = the task directory basename)
- Produces: endpoint type `ArgoCDServerConnection`, satisfying the `connectedService:ArgoCDServerConnection` input declared in Task 3

**Critical:** Toolbox currently does not override `contributions`, so it inherits the auto-generated task contributions. The new manifest MUST spread `base.contributions` rather than replacing it — otherwise both tasks vanish from the extension. The repo has been burned by contribution-id changes before (see `dbd4121: fix: use previous task contributions ids`), so preserving the generated ids matters.

- [ ] **Step 1: Record the current contribution ids as a baseline**

```bash
cd extensions/toolbox && node vss-extension.js 2>/dev/null | python3 -c "
import json,sys
s=sys.stdin.read()
m=json.loads(s[s.index('{'):])
print([c['id'] for c in m['contributions']])
"; cd ../..
```

Expected: `['ArgoCDCliInstaller', 'GitHubToolInstaller']` (order may vary).

- [ ] **Step 2: Add the endpoint contribution**

Edit `extensions/toolbox/vss-extension.js` so `manifest()` returns:

```js
function manifest() {
  return {
    ...base,
    id: '853934ee-2696-11f1-b8e6-00155d89217a',
    public: true,
    name: 'Toolbox',
    description: 'Azure Pipelines Toolbox',
    tags: ['tools', 'installer'],
    version,
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
    ],
  }
}
```

Leave the `id`, `tags`, and `console.log` line untouched.

- [ ] **Step 3: Verify all three contributions are present**

```bash
cd extensions/toolbox && node vss-extension.js 2>/dev/null | python3 -c "
import json,sys
s=sys.stdin.read()
m=json.loads(s[s.index('{'):])
for c in m['contributions']:
    print(c['id'], '|', c['type'], '|', c.get('properties',{}).get('name',''))
"; cd ../..
```

Expected three lines — both task contributions with their **original** ids, plus the endpoint:
```
ArgoCDCliInstaller | ms.vss-distributed-task.task | tasks/ArgoCDCliInstaller
GitHubToolInstaller | ms.vss-distributed-task.task | tasks/GitHubToolInstaller
argocd-service-endpoint | ms.vss-endpoint.service-endpoint-type | ArgoCDServerConnection
```

If `GitHubToolInstaller` is missing, the spread was dropped — fix before committing.

- [ ] **Step 4: Lint and commit**

```bash
pnpm biome check --fix extensions/toolbox/vss-extension.js
git add extensions/toolbox/vss-extension.js
git commit -m "feat(toolbox): contribute Argo CD Server endpoint type

Registers ArgoCDServerConnection so ArgoCDCliInstaller can consume a
service connection. The internal name differs from the argocd extension's
ArgoCDServer because endpoint type names are collection-global and both
extensions may be installed at once.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Deprecate the ArgoCDInstaller task

**Files:**
- Modify: `extensions/argocd/tasks/ArgoCDInstaller/task.json`
- Modify: `extensions/argocd/tasks/ArgoCDInstaller/README.md`
- Modify: `extensions/argocd/README.md`

**Interfaces:**
- Consumes: the `ArgoCDCliInstaller@0` task name from Task 3, and the `ArgoCDServerConnection` endpoint from Task 4
- Produces: nothing later tasks depend on

- [ ] **Step 1: Add deprecation metadata to `task.json`**

In `extensions/argocd/tasks/ArgoCDInstaller/task.json`, bump `version.Minor` from `2` to `3`, and add the three deprecation fields immediately after the `version` block:

```json
  "version": {
    "Major": 0,
    "Minor": 3,
    "Patch": 0
  },
  "deprecated": true,
  "deprecationMessage": "ArgoCDInstaller is deprecated and will be removed after 2027-01-31. Use ArgoCDCliInstaller@0 from the Toolbox extension. You must recreate your Argo CD service connection under the Toolbox endpoint type.",
  "removalDate": "2027-01-31",
```

- [ ] **Step 2: Verify the JSON still parses and the fields landed**

```bash
python3 -c "
import json
d=json.load(open('extensions/argocd/tasks/ArgoCDInstaller/task.json'))
print(d['version'], d['deprecated'], d['removalDate'])
assert d['deprecated'] is True and d['removalDate']=='2027-01-31'
print('OK')
"
```

Expected: `{'Major': 0, 'Minor': 3, 'Patch': 0} True 2027-01-31` then `OK`.

- [ ] **Step 3: Add a deprecation callout to the task README**

Insert immediately after the `# Argo CD CLI Installer` heading in `extensions/argocd/tasks/ArgoCDInstaller/README.md`:

```markdown
> [!WARNING]
> **Deprecated — will be removed after 2027-01-31.**
> Use **`ArgoCDCliInstaller@0`** from the
> [Toolbox extension](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/toolbox/tasks/ArgoCDCliInstaller/README.md) instead.
> See [Migration](#migration) below.
```

Then append this section to the end of the same file:

````markdown
## Migration

Replace the task name and recreate the service connection. Inputs are unchanged.

```yaml
# Before
- task: ArgoCDInstaller@0
  inputs:
    connection: argocd-prod
    version: server
    options: --grpc-web

# After
- task: ArgoCDCliInstaller@0
  inputs:
    connection: argocd-prod-toolbox
    version: server
    options: --grpc-web
```

**One manual step:** the Toolbox task uses its own service connection type, because Azure DevOps
endpoint type names are global to a collection and cannot be shared between two installed extensions.
Create a new **Argo CD Server** service connection from the Toolbox extension and point the
`connection` input at it. The URL and API token are the same as before.

Everything else — `latest`/`server`/explicit version resolution, the server download fallback, and the
`ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`, and `ARGOCD_OPTS` variables — behaves identically.
````

- [ ] **Step 4: Add a deprecation callout to the extension README**

Insert immediately after the `# Argo CD CLI Extension` heading in `extensions/argocd/README.md`:

```markdown
> [!WARNING]
> **Deprecated — will be removed after 2027-01-31.**
> The Argo CD CLI installer has moved to the
> [Toolbox extension](https://marketplace.visualstudio.com/items?itemName=bonddim.toolbox) as
> **`ArgoCDCliInstaller@0`**. See the
> [migration guide](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/argocd/tasks/ArgoCDInstaller/README.md#migration).
```

- [ ] **Step 5: Commit**

```bash
pnpm biome check --fix
git add extensions/argocd
git commit -m "feat(argocd)!: deprecate ArgoCDInstaller task

Marks the task deprecated with a 2027-01-31 removal date pointing at
ArgoCDCliInstaller@0 in the Toolbox extension, and documents the one
manual migration step (recreating the service connection).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Deprecate the TerramateInstaller task

**Files:**
- Modify: `extensions/terramate/tasks/TerramateInstaller/task.json`
- Modify: `extensions/terramate/tasks/TerramateInstaller/README.md`
- Modify: `extensions/terramate/README.md`

**Interfaces:**
- Consumes: the existing `GitHubToolInstaller@0` task (no changes made to it)
- Produces: nothing later tasks depend on

**Note:** `GitHubToolInstaller` requires GitHub authentication and `TerramateInstaller` does not. This is a real regression for migrating users and MUST be stated explicitly in every notice — the spec deliberately deferred relaxing that requirement.

- [ ] **Step 1: Add deprecation metadata to `task.json`**

In `extensions/terramate/tasks/TerramateInstaller/task.json`, bump `version.Minor` from `2` to `3`, and add the three deprecation fields immediately after the `version` block:

```json
  "version": {
    "Major": 0,
    "Minor": 3,
    "Patch": 0
  },
  "deprecated": true,
  "deprecationMessage": "TerramateInstaller is deprecated and will be removed after 2027-01-31. Use GitHubToolInstaller@0 from the Toolbox extension with repository 'terramate-io/terramate'. It requires a GitHub service connection or a GITHUB_TOKEN variable.",
  "removalDate": "2027-01-31",
```

- [ ] **Step 2: Verify the JSON still parses and the fields landed**

```bash
python3 -c "
import json
d=json.load(open('extensions/terramate/tasks/TerramateInstaller/task.json'))
print(d['version'], d['deprecated'], d['removalDate'])
assert d['deprecated'] is True and d['removalDate']=='2027-01-31'
print('OK')
"
```

Expected: `{'Major': 0, 'Minor': 3, 'Patch': 0} True 2027-01-31` then `OK`.

- [ ] **Step 3: Add a deprecation callout to the task README**

Insert immediately after the `# Terramate CLI Installer` heading in `extensions/terramate/tasks/TerramateInstaller/README.md`:

```markdown
> [!WARNING]
> **Deprecated — will be removed after 2027-01-31.**
> Use **`GitHubToolInstaller@0`** from the
> [Toolbox extension](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/toolbox/tasks/GitHubToolInstaller/README.md) instead.
> See [Migration](#migration) below.
```

Then append this section to the end of the same file (keep the existing "not an official Terramate extension" note last):

````markdown
## Migration

```yaml
# Before
- task: TerramateInstaller@0
  inputs:
    version: latest

# After
- task: GitHubToolInstaller@0
  inputs:
    connection: my-github-connection
    repository: terramate-io/terramate
    version: latest
```

**`GitHubToolInstaller` requires GitHub authentication; `TerramateInstaller` did not.** Provide either
a GitHub service connection via the `connection` input, or a `GITHUB_TOKEN` variable:

```yaml
- task: GitHubToolInstaller@0
  inputs:
    repository: terramate-io/terramate
  env:
    GITHUB_TOKEN: $(GITHUB_TOKEN)
```

Pinned versions work the same way, with or without the `v` prefix:

```yaml
- task: GitHubToolInstaller@0
  inputs:
    connection: my-github-connection
    repository: terramate-io/terramate
    version: v0.16.0
```

No `filePattern` is needed — Terramate's release assets are matched unambiguously on Linux, macOS,
and Windows agents for both x64 and arm64.
````

- [ ] **Step 4: Add a deprecation callout to the extension README**

Insert immediately after the `# Terramate Extension` heading in `extensions/terramate/README.md`:

```markdown
> [!WARNING]
> **Deprecated — will be removed after 2027-01-31.**
> Use **`GitHubToolInstaller@0`** from the
> [Toolbox extension](https://marketplace.visualstudio.com/items?itemName=bonddim.toolbox) with
> `repository: terramate-io/terramate`. It requires a GitHub service connection or a `GITHUB_TOKEN`
> variable. See the
> [migration guide](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/terramate/tasks/TerramateInstaller/README.md#migration).
```

- [ ] **Step 5: Commit**

```bash
pnpm biome check --fix
git add extensions/terramate
git commit -m "feat(terramate)!: deprecate TerramateInstaller task

Marks the task deprecated with a 2027-01-31 removal date pointing at
GitHubToolInstaller@0. Documents that the replacement requires GitHub
authentication, which this task did not.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Document the new Toolbox task

**Files:**
- Create: `extensions/toolbox/tasks/ArgoCDCliInstaller/README.md`
- Modify: `extensions/toolbox/README.md`
- Modify: `README.md` (repo root)

**Interfaces:**
- Consumes: the task name, inputs, and endpoint type from Tasks 3 and 4
- Produces: the `helpUrl` target that Task 3's `task.json` already points at

- [ ] **Step 1: Write the new task README**

Create `extensions/toolbox/tasks/ArgoCDCliInstaller/README.md`:

````markdown
# Argo CD CLI Installer

Install Argo CD CLI on Azure DevOps pipeline agents.

## Features

- Supports Linux, macOS, and Windows agents.
- Caches the binary using the Azure Pipelines tool cache, so subsequent runs with the same version skip the download.
- Installs the latest [released](https://github.com/argoproj/argo-cd/releases) version by default.
- Adds an **Argo CD Server** service connection to securely store credentials.
- Sets **ARGOCD_SERVER** and **ARGOCD_AUTH_TOKEN** environment variables from the provided service connection.
- Optionally sets the **ARGOCD_OPTS** variable for extra configuration.
- Built-in fallback mechanism for binary download in server mode.

## Inputs

| Name         | Type               | Required | Default  | Description                                                                               |
| ------------ | ------------------ | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `connection` | Service Connection | No       |          | Argo CD Server service connection                                                         |
| `version`    | String             | No       | `latest` | CLI version to install (`latest`, `server`, or a specific version like `v3.3.0`)          |
| `options`    | String             | No       |          | Extra arguments for the `ARGOCD_OPTS` environment variable (e.g. `--grpc-web --insecure`) |

## Usage

### Install latest version

```yaml
- task: ArgoCDCliInstaller@0
```

```yaml
- task: ArgoCDCliInstaller@0
  inputs:
    version: latest
```

### Install specific version

```yaml
- task: ArgoCDCliInstaller@0
  inputs:
    version: v3.3.0
```

### Install server version

This option installs the version matching your Argo CD server. Requires a service connection.

```yaml
- task: ArgoCDCliInstaller@0
  inputs:
    connection: ServiceConnectionName or ServiceConnectionID
    version: server
    options: --grpc-web
```

## Version Resolution

The task resolves the CLI version based on the `version` input:

* `latest` - Fetches the latest release tag from the [GitHub releases](https://github.com/argoproj/argo-cd/releases) page. If resolution fails, the task fails immediately.
* `server` - Queries the Argo CD server API (`/api/version`) to determine the running version. Requires a service connection. If the server is unreachable or returns an invalid response, the task fails immediately.
* Explicit version (e.g. `v3.3.0`) - Used as-is without any remote lookup.

## Fallback Behavior

### Download fallback (server mode only)

When version is set to `server`, the task first attempts to download the binary directly from the Argo CD server
(`{serverUrl}/download/argocd-{platform}-{arch}`).
If the server returns a non-2xx HTTP response, it falls back to the GitHub releases download using the resolved server version and logs a warning.
Any other error (network failure, disk error, etc.) fails the task immediately without a fallback.

## Environment Variables

The task sets the following environment variables when a service connection is provided:

| Variable            | Description                                                                            |
| ------------------- | -------------------------------------------------------------------------------------- |
| `ARGOCD_SERVER`     | Server hostname and path extracted from the service connection URL (without protocol). |
| `ARGOCD_AUTH_TOKEN` | API token from the service connection credentials.                                     |
| `ARGOCD_OPTS`       | Set only when the `options` input is provided. Contains extra CLI flags.               |

## Caching

The task uses the Azure Pipelines [tool cache](https://learn.microsoft.com/en-us/azure/devops/pipelines/release/caching)
to store downloaded binaries. On subsequent runs with the same version, the cached binary is reused and the download
step is skipped entirely.

## Migrating from ArgoCDInstaller@0

This task replaces `ArgoCDInstaller@0` from the deprecated
[Argo CD CLI Extension](https://marketplace.visualstudio.com/items/bonddim.argocd-installer),
which is removed after 2027-01-31.

```yaml
# Before
- task: ArgoCDInstaller@0
  inputs:
    connection: argocd-prod
    version: server

# After
- task: ArgoCDCliInstaller@0
  inputs:
    connection: argocd-prod-toolbox
    version: server
```

Inputs and behaviour are identical. The one manual step is recreating the service connection:
Azure DevOps endpoint type names are global to a collection, so Toolbox registers its own
**Argo CD Server** connection type rather than reusing the deprecated extension's. Create a new
service connection with the same URL and API token, then point `connection` at it.
````

- [ ] **Step 2: Add the task to the Toolbox extension README**

In `extensions/toolbox/README.md`, extend the `## Tasks` list so it reads:

```markdown
## Tasks

- [GitHubToolInstaller](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/toolbox/tasks/GitHubToolInstaller/README.md) - Install any tool from GitHub releases
- [ArgoCDCliInstaller](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/toolbox/tasks/ArgoCDCliInstaller/README.md) - Install Argo CD CLI on pipeline agents
```

- [ ] **Step 3: Update the root README extension list**

The root `README.md` currently lists only the Argo CD extension. Replace its `## Extensions` section with:

```markdown
## Extensions

- [Toolbox](https://marketplace.visualstudio.com/items?itemName=bonddim.toolbox) - Install any tool from GitHub releases, plus the Argo CD CLI.
- [Argo CD CLI Extension](https://marketplace.visualstudio.com/items/bonddim.argocd-installer) - **Deprecated**, removed after 2027-01-31. Use `ArgoCDCliInstaller@0` from Toolbox.
- [Terramate](https://marketplace.visualstudio.com/items?itemName=bonddim.terramate-devops-extension) - **Deprecated**, removed after 2027-01-31. Use `GitHubToolInstaller@0` from Toolbox.
```

- [ ] **Step 4: Check every relative link resolves**

```bash
python3 - <<'PY'
import os, re
targets = [
  'extensions/toolbox/tasks/ArgoCDCliInstaller/README.md',
  'extensions/toolbox/tasks/GitHubToolInstaller/README.md',
  'extensions/argocd/tasks/ArgoCDInstaller/README.md',
  'extensions/terramate/tasks/TerramateInstaller/README.md',
]
missing = [t for t in targets if not os.path.exists(t)]
print('MISSING:', missing or 'none')
PY
```

Expected: `MISSING: none`

- [ ] **Step 5: Commit**

```bash
pnpm biome check --fix
git add extensions/toolbox README.md
git commit -m "docs(toolbox): document ArgoCDCliInstaller and mark old extensions deprecated

Adds the new task README with a migration section, lists it in the Toolbox
README, and updates the root README to cover all three extensions.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Add the changeset and run full verification

**Files:**
- Create: `.changeset/<generated-name>.md`

**Interfaces:**
- Consumes: everything above
- Produces: the release entry CI uses to version and publish all three extensions

Package names come from `package.json` `name` fields — `toolbox`, `terramate`, and
**`argo-cd-cli-extension`** (the argocd directory's package is NOT named `argocd`).

- [ ] **Step 1: Confirm the package names**

```bash
python3 -c "
import json
for d in ['argocd','terramate','toolbox']:
    print(d, '->', json.load(open(f'extensions/{d}/package.json'))['name'])
"
```

Expected:
```
argocd -> argo-cd-cli-extension
terramate -> terramate
toolbox -> toolbox
```

- [ ] **Step 2: Write the changeset**

Create `.changeset/argocd-toolbox-migration.md`:

```markdown
---
'argo-cd-cli-extension': patch
'terramate': patch
'toolbox': minor
---

Migrate the Argo CD CLI installer into the Toolbox extension and deprecate the standalone extensions.

- **Toolbox** gains `ArgoCDCliInstaller@0` and an `ArgoCDServerConnection` service endpoint type. Behaviour matches the previous `ArgoCDInstaller@0`; only the task name and connection type differ.
- **Argo CD CLI Extension** is deprecated and will be removed after 2027-01-31. Migrate to `ArgoCDCliInstaller@0` and recreate the service connection under the Toolbox endpoint type.
- **Terramate** is deprecated and will be removed after 2027-01-31. Migrate to `GitHubToolInstaller@0` with `repository: terramate-io/terramate`, which requires a GitHub service connection or a `GITHUB_TOKEN` variable.
```

- [ ] **Step 3: Run the full verification suite**

```bash
pnpm biome check && pnpm typecheck && pnpm test --run
```

Expected: Biome reports only the 2 pre-existing `noNonNullAssertion` warnings in
`GitHubToolInstaller/src/run.ts` (lines 78, 166); typecheck passes; all test suites pass.

- [ ] **Step 4: Verify both deprecated tasks and the new task build and package**

```bash
PNPM_BASE=origin/main pnpm build
cd extensions/toolbox && node vss-extension.js 2>/dev/null | python3 -c "
import json,sys
s=sys.stdin.read()
m=json.loads(s[s.index('{'):])
ids=[c['id'] for c in m['contributions']]
assert 'ArgoCDCliInstaller' in ids, ids
assert 'GitHubToolInstaller' in ids, ids
assert 'argocd-service-endpoint' in ids, ids
print('manifest OK:', ids)
"; cd ../..
```

Expected: `manifest OK: [...]` listing all three contributions.

- [ ] **Step 5: Confirm no stray files are about to be committed**

```bash
git status --short
```

Expected: only `.changeset/argocd-toolbox-migration.md` as untracked, plus `.claude/` and `CLAUDE.md` which must stay uncommitted. Build output under `dist/` is gitignored.

- [ ] **Step 6: Commit**

```bash
git add .changeset/argocd-toolbox-migration.md
git commit -m "chore: add changeset for extension deprecation and Argo CD migration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Post-Implementation

Open a tracking issue for the removal work, to be done after **2027-01-31**:

- Delete `extensions/terramate/` and `extensions/argocd/`
- Remove their entries from the root `tsconfig.json` references
- Unpublish both extensions from the Azure DevOps Marketplace
- Update the root `README.md` extension list

## Out of Scope

Deliberately excluded, per the spec's "Decisions deliberately deferred":

- Making GitHub authentication optional in `GitHubToolInstaller`
- Rewriting the Argo CD task on top of `GitHubToolInstaller` internals
- Fixing the 2 pre-existing `noNonNullAssertion` Biome warnings
