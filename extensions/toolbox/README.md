# Toolbox - GitHub Tool Installer

Azure DevOps extension to install any tool from GitHub releases.

Uses the GitHub API to automatically detect the correct binary for the current platform and architecture.

## Authentication

GitHub authentication is **required**. Provide one of:
- A GitHub service connection via the `connection` input (preferred)
- The `GITHUB_TOKEN` environment variable

## Usage

```yaml
# Latest version (auto-detect binary)
- task: GitHubToolInstaller@0
  inputs:
    connection: 'my-github-connection'
    repository: 'cli/cli'

# Exact version
- task: GitHubToolInstaller@0
  inputs:
    connection: 'my-github-connection'
    repository: 'mikefarah/yq'
    version: 'v4.44.0'

# Semver range - installs latest 4.x release
- task: GitHubToolInstaller@0
  inputs:
    connection: 'my-github-connection'
    repository: 'mikefarah/yq'
    version: '4.x'

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
    connection: 'my-github-connection'
    repository: 'hashicorp/terraform'
    filePattern: 'terraform_*'

# Multiple tools
- task: GitHubToolInstaller@0
  inputs:
    connection: 'my-github-connection'
    repository: 'mikefarah/yq'

- task: GitHubToolInstaller@0
  inputs:
    connection: 'my-github-connection'
    repository: 'jqlang/jq'
```

## Inputs

| Input         | Required | Default  | Description                                                                       |
| ------------- | -------- | -------- | --------------------------------------------------------------------------------- |
| `connection`  | No       | -        | GitHub service connection. Required if `GITHUB_TOKEN` env var is not set          |
| `repository`  | Yes      | -        | GitHub repository in `owner/repo` format                                          |
| `version`     | No       | `latest` | `latest`, exact version (`v1.2.3`), or semver range (`1.0.x`, `~1.2.0`, `^1.0.0`) |
| `filePattern` | No       | -        | Glob pattern to filter release assets when auto-detection finds multiple matches  |

## How It Works

1. **Authentication** - uses GitHub service connection or `GITHUB_TOKEN`
2. **Version resolution** - fetches the target release via the GitHub API. Supports `latest`, exact tags, and semver ranges
3. **Asset matching** - automatically finds the correct binary for the current OS and architecture by matching platform/arch keywords in asset filenames
4. **Installation** - downloads, extracts (if archive), caches, and adds the tool to `PATH`
