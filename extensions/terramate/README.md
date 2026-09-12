# Terramate Extension

> ⚠️ **Deprecated - will be removed after 2027-01-31.**
> Use **`GitHubToolInstaller@0`** from the
> [Toolbox extension](https://marketplace.visualstudio.com/items?itemName=bonddim.853934ee-2696-11f1-b8e6-00155d89217a) with
> `repository: terramate-io/terramate`. See [Migration](#migration) below.

Terramate extension for Azure DevOps Pipelines.

Install from the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/items?itemName=bonddim.terramate-devops-extension).

## Tasks

- [TerramateInstaller](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/terramate/tasks/TerramateInstaller/README.md) - Install Terramate CLI on pipeline agents

## Migration

- Install the [Toolbox extension](https://marketplace.visualstudio.com/items?itemName=bonddim.853934ee-2696-11f1-b8e6-00155d89217a) from the Azure DevOps Marketplace.
- Use existing or create a new **GitHub** service connection (only public repositories read are required if using Personal Access Token).
- Replace the task in your pipelines.
- Uninstall the "Terramate" extension from your Azure DevOps organization.

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

No `filePattern` is needed - Terramate's release assets are matched unambiguously on Linux (x64, arm64),
Windows (x64), and macOS (arm64) agents.

> **Note:** This is not an official Terramate extension.
