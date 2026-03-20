import { debug } from 'azure-pipelines-task-lib/task'

/**
 * Get the latest version of a tool from its GitHub releases page
 * @param repo GitHub repository in the format "owner/repo"
 * @returns latest version string
 * @throws if the version cannot be resolved from the redirect location
 */
export async function getLatestVersion(repo: string): Promise<string> {
  debug(`Resolving latest version from ${repo}`)
  const response = await fetch(
    new Request(`https://github.com/${repo}/releases/latest`, {
      redirect: 'manual',
      method: 'HEAD',
      headers: { connection: 'close' },
    }),
  )
  const locationHeader = response.headers.get('location')
  const version = locationHeader?.split('/')?.pop()

  if (!version) {
    throw new Error(`Failed to resolve latest version from ${repo}`)
  }

  debug(`Resolved latest version: ${version}`)
  return version
}
