# Toolbox - GitHub Tool Installer

Azure DevOps extension to install any tool from GitHub releases.

Uses the GitHub API to automatically detect the correct binary for the current platform and architecture.

## Authentication

GitHub authentication is **required**. Provide one of:
- A GitHub service connection via the `githubConnection` input
- The `GITHUB_TOKEN` environment variable

## Usage

```yaml
# Latest version (auto-detect binary)
- task: GitHubToolInstaller@0
  inputs:
    repository: 'cli/cli'
    githubConnection: 'my-github-connection'

# Exact version
- task: GitHubToolInstaller@0
  inputs:
    repository: 'mikefarah/yq'
    version: 'v4.44.0'
    githubConnection: 'my-github-connection'

# Semver range — installs latest 4.x release
- task: GitHubToolInstaller@0
  inputs:
    repository: 'mikefarah/yq'
    version: '4.x'
    githubConnection: 'my-github-connection'

# Using GITHUB_TOKEN env var
- task: GitHubToolInstaller@0
  inputs:
    repository: 'jqlang/jq'
    version: '~1.7.0'
  env:
    GITHUB_TOKEN: $(GITHUB_TOKEN)

# With filePattern to disambiguate
- task: GitHubToolInstaller@0
  inputs:
    repository: 'hashicorp/terraform'
    filePattern: 'terraform_*'
    githubConnection: 'my-github-connection'

# Multiple tools
- task: GitHubToolInstaller@0
  inputs:
    repository: 'mikefarah/yq'
    githubConnection: 'my-github-connection'

- task: GitHubToolInstaller@0
  inputs:
    repository: 'jqlang/jq'
    githubConnection: 'my-github-connection'
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `repository` | Yes | - | GitHub repository in `owner/repo` format |
| `version` | No | `latest` | `latest`, exact version (`v1.2.3`), or semver range (`1.0.x`, `~1.2.0`, `^1.0.0`) |
| `githubConnection` | No | - | GitHub service connection. Required if `GITHUB_TOKEN` env var is not set |
| `filePattern` | No | - | Glob pattern to filter release assets when auto-detection finds multiple matches |

## How It Works

1. **Authentication** — uses GitHub service connection or `GITHUB_TOKEN`
2. **Version resolution** — fetches the target release via the GitHub API. Supports `latest`, exact tags, and semver ranges
3. **Asset matching** — automatically finds the correct binary for the current OS and architecture by matching platform/arch keywords in asset filenames
4. **Checksum validation** — if a checksum file (e.g., `checksums.txt`, `SHA256SUMS`) is found among release assets, it is used to validate the downloaded binary
5. **Installation** — downloads, extracts (if archive), caches, and adds the tool to `PATH`
