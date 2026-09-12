# Terramate CLI Installer

> [!WARNING]
> **Deprecated — will be removed after 2027-01-31.**
> Use **`GitHubToolInstaller@0`** from the
> [Toolbox extension](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/toolbox/tasks/GitHubToolInstaller/README.md) instead.
> See [Migration](#migration) below.

Install [Terramate CLI](https://terramate.io/) on Azure DevOps pipeline agents.

- Supports Linux, macOS, and Windows agents.
- Adds Terramate CLI to the system PATH for use in subsequent pipeline steps.
- Allows installation of a specific version or installs the latest release by default.
- Caches the downloaded binary to speed up subsequent pipeline runs.

## Inputs

| Name      | Type   | Required | Default  | Description                                                          |
| --------- | ------ | -------- | -------- | -------------------------------------------------------------------- |
| `version` | String | No       | `latest` | Version of Terramate CLI to install. If not specified, latest will be installed |

## Usage

Install the latest released version:

```yaml
steps:
  - task: TerramateInstaller@0
```

```yaml
steps:
  - task: TerramateInstaller@0
    inputs:
      version: latest
```

Install a specific version:

```yaml
steps:
  - task: TerramateInstaller@0
    inputs:
      version: v0.16.0 # or 0.16.0
```

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

> **Note:** This is not an official Terramate extension.
