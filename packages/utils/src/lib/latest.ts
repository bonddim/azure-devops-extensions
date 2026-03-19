import { debug, warning } from 'azure-pipelines-task-lib/task'

/**
 * Get the latest version of a tool from its GitHub releases page
 * @param repo GitHub repository in the format "owner/repo"
 * @returns latest version string, or empty string if not found
 */
export async function getLatestVersion(repo: string): Promise<string> {
  debug(`Resolving latest version from ${repo}`)
  const response = await fetch(
    new Request(`https://github.com/${repo}/releases/latest`, { redirect: 'manual', method: 'HEAD' }),
  )
  const locationHeader = response.headers.get('location')
  const version = locationHeader?.split('/')?.pop()

  if (!version) {
    warning(`Failed to resolve latest version from ${repo}`)
    return ''
  }

  debug(`Resolved latest version: ${version}`)
  return version
}
