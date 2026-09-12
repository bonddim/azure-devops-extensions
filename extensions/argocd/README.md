# Argo CD CLI Extension

> ⚠️ **Deprecated - will be removed after 2027-01-31.**
> The Argo CD CLI installer has moved to the
> [Toolbox extension](https://marketplace.visualstudio.com/items?itemName=bonddim.853934ee-2696-11f1-b8e6-00155d89217a) as
> **`ArgoCDCliInstaller@0`**. See [Migration](#migration) below.

Argo CD CLI Extension for Azure DevOps Pipelines.

Install from the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/items/bonddim.argocd-installer).

## Tasks

- [ArgoCDInstaller](https://github.com/bonddim/azure-devops-extensions/blob/main/extensions/argocd/tasks/ArgoCDInstaller/README.md) - Install Argo CD CLI on pipeline agents

## Migration

- Uninstall the "Argo CD CLI Extension" from your Azure DevOps organization.
- Install the [Toolbox extension](https://marketplace.visualstudio.com/items?itemName=bonddim.853934ee-2696-11f1-b8e6-00155d89217a) from the Azure DevOps Marketplace.
- Create a new **Argo CD Server** service connection (could be the same as the one used previously).
- Replace the task name in your pipelines. Inputs are unchanged.

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
    connection: argocd-prod
    version: server
    options: --grpc-web
```
Everything else - `latest`/`server`/explicit version resolution, the server download fallback, and the
`ARGOCD_SERVER`, `ARGOCD_AUTH_TOKEN`, and `ARGOCD_OPTS` variables - behaves identically.
