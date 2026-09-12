# Terramate Azure DevOps Extension

Install the extension from the [Azure DevOps Marketplace](https://marketplace.visualstudio.com/items?itemName=bonddim.terramate-devops-extension).

## TerramateInstaller Task

- Installs the [Terramate CLI](https://terramate.io/) on an Azure DevOps agent.
- Supports Linux, macOS, and Windows agents.
- Adds Terramate CLI to the system PATH for use in subsequent pipeline steps.
- Allows installation of a specific version or installs the latest release by default.
- Caches the downloaded binary to speed up subsequent pipeline runs.

### Usage

- Install the latest released version:

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

- Install a specific version:

    ```yaml
    steps:
      - task: TerramateInstaller@0
        inputs:
          version: v0.16.0 # or 0.16.0
    ```

> **Note:** This is not an official Terramate extension.
