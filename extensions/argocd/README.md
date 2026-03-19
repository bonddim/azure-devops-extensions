# Argo CD CLI Installer Task

## Features

- Supports Linux, macOS, and Windows agents.
- Caches the binary using the Azure Pipelines tool cache, so subsequent runs with the same version skip the download.
- Installs the latest [released](https://github.com/argoproj/argo-cd/releases) version by default.
- Adds **Argo CD Server** service connection to securely store credentials.
- Sets **ARGOCD_SERVER** and **ARGOCD_AUTH_TOKEN** environment variables from the provided service connection.
- Optionally sets the **ARGOCD_OPTS** variable for extra configuration.
- Built-in fallback mechanism for both version resolution and binary download.

## Installation

Install the extension from the
[Azure DevOps Marketplace](https://marketplace.visualstudio.com/items/bonddim.argocd-installer).

## Inputs

| Name         | Type               | Required | Default  | Description                                                                               |
| ------------ | ------------------ | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `connection` | Service Connection | No       |          | Argo CD Server service connection for credentials                                         |
| `version`    | String             | No       | `latest` | CLI version to install (`latest`, `server`, or a specific version like `v2.14.2`)         |
| `options`    | String             | No       |          | Extra arguments for the `ARGOCD_OPTS` environment variable (e.g. `--grpc-web --insecure`) |

## Usage

### Install latest version

Use this configuration to install the latest released version:

```yaml
- task: ArgoCDInstaller@1
```

```yaml
- task: ArgoCDInstaller@1
  inputs:
    version: latest
```

### Install specific version

To install a specific version of Argo CD CLI, specify the desired version:

```yaml
- task: ArgoCDInstaller@1
  inputs:
    version: v2.14.2
```

### Install server version

This option installs the version matching your Argo CD server. Requires a service connection.

```yaml
- task: ArgoCDInstaller@1
  inputs:
    connection: ServiceConnectionName or ServiceConnectionID
    version: server
    options: --grpc-web
```

## Version Resolution

The task resolves the CLI version based on the `version` input:

| Value                             | Behavior                                                                                                                                                                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `latest` (default)                | Fetches the latest release tag from the [GitHub releases](https://github.com/argoproj/argo-cd/releases) page. If resolution fails, falls back to a hardcoded fallback version with a warning.                                                                            |
| `server`                          | Queries the Argo CD server API (`/api/version`) to determine the running version. Requires a service connection. Build metadata (e.g. `+abc123`) is stripped automatically. **If the server is unreachable or returns an invalid response, the task fails immediately.** |
| Explicit version (e.g. `v2.14.2`) | Used as-is without any remote lookup.                                                                                                                                                                                                                                    |

## Fallback Behavior

The task includes fallback mechanisms to improve reliability:

### Version resolution fallback

When version is set to `latest` and the GitHub API is unreachable, the task falls back to a hardcoded fallback version
and logs a warning. This does **not** apply to `server` mode - if the Argo CD server API is unavailable, the task fails
because installing an arbitrary version against an unknown server would be unsafe.

### Download fallback

When the primary download source fails, the task automatically retries from an alternative URL:

- **`server` mode**: Attempts to download the binary directly from the Argo CD server
  (`{serverUrl}/download/argocd-{platform}-{arch}`). If the server download fails, falls back to the GitHub releases
  download with resolved server version.
- **`latest` or explicit version**: Downloads from GitHub releases. If that fails, falls back to the hardcoded version.

In both cases, the fallback is transparent - the task logs a warning and continues without manual intervention. If the
fallback also fails, the task reports a failure.

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
