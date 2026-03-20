## Features

- Supports Linux, macOS, and Windows agents.
- Caches the binary using the Azure Pipelines tool cache, so subsequent runs with the same version skip the download.
- Installs the latest [released](https://github.com/argoproj/argo-cd/releases) version by default.
- Adds **Argo CD Server** service connection to securely store credentials.
- Sets **ARGOCD_SERVER** and **ARGOCD_AUTH_TOKEN** environment variables from the provided service connection.
- Optionally sets the **ARGOCD_OPTS** variable for extra configuration.
- Built-in fallback mechanism for binary download in server mode.

## Installation

Install the extension from the
[Azure DevOps Marketplace](https://marketplace.visualstudio.com/items/bonddim.argocd-installer).

## Usage

### Inputs

| Name         | Type               | Required | Default  | Description                                                                               |
| ------------ | ------------------ | -------- | -------- | ----------------------------------------------------------------------------------------- |
| `connection` | Service Connection | No       |          | Argo CD Server service connection                                                         |
| `version`    | String             | No       | `latest` | CLI version to install (`latest`, `server`, or a specific version like `v3.3.0`)          |
| `options`    | String             | No       |          | Extra arguments for the `ARGOCD_OPTS` environment variable (e.g. `--grpc-web --insecure`) |


### Install latest version

Use this configuration to install the latest released version:

```yaml
- task: ArgoCDInstaller@0
```

```yaml
- task: ArgoCDInstaller@0
  inputs:
    version: latest
```

### Install specific version

To install a specific version of Argo CD CLI, specify the desired version:

```yaml
- task: ArgoCDInstaller@0
  inputs:
    version: v3.3.0
```

### Install server version

This option installs the version matching your Argo CD server. Requires a service connection.

```yaml
- task: ArgoCDInstaller@0
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
