---
'argo-cd-cli-extension': patch
'terramate': patch
'toolbox': minor
---

Migrate the Argo CD CLI installer into the Toolbox extension and deprecate the standalone extensions.

- **Toolbox** gains `ArgoCDCliInstaller@0` and an `ArgoCDServerConnection` service endpoint type. Behaviour matches the previous `ArgoCDInstaller@0`; only the task name and connection type differ.
- **Argo CD CLI Extension** is deprecated and will be removed after 2027-01-31. Migrate to `ArgoCDCliInstaller@0` and recreate the service connection under the Toolbox endpoint type.
- **Terramate** is deprecated and will be removed after 2027-01-31. Migrate to `GitHubToolInstaller@0` with `repository: terramate-io/terramate`, which requires a GitHub service connection or a `GITHUB_TOKEN` variable.
