import * as os from 'node:os'
import * as utils from '@bonddim/utils'
import * as task from 'azure-pipelines-task-lib/task'

const toolName = 'argocd'
const repo = 'argoproj/argo-cd'
const githubDownloadUrl = `https://github.com/${repo}/releases/download`
const downloadFileName = `${toolName}-${utils.isWindows() ? 'windows' : os.platform()}-${os.arch() === 'x64' ? 'amd64' : os.arch()}${utils.isWindows() ? '.exe' : ''}`

/**
 * Installs ArgoCD CLI based on task inputs and configures task variables.
 *
 * Supports explicit versions, latest release resolution, and server-based
 * version resolution using a service connection.
 */
export async function run() {
  try {
    const inputConnection = task.getInput('connection', false)
    const inputVersion = task.getInput('version') ?? 'latest'
    const inputOpts = task.getInput('options')

    // Validate inputs and fail early if required parameters are missing
    if (inputVersion.toLowerCase() === 'server' && !inputConnection) {
      throw new Error('Service connection is required when version is set to server')
    }

    // Set ARGOCD_OPTS if provided, allowing users to specify additional options for the ArgoCD CLI
    if (inputOpts) {
      task.debug(`Setting ARGOCD_OPTS to ${inputOpts}`)
      task.setVariable('ARGOCD_OPTS', inputOpts)
    }

    // Get server URL if a service connection is provided
    const serverUrl = inputConnection ? getEndpointDetails(inputConnection) : undefined

    // Resolve version — throws on failure (no fallback)
    const version = await resolveVersion(inputVersion, serverUrl)

    // Install the tool, preferring the server download endpoint when version is set to 'server' and falling back to GitHub releases on failure
    if (inputVersion.toLowerCase() === 'server' && serverUrl) {
      await installFromServer(version, serverUrl)
    } else {
      await utils.installTool(toolName, version, `${githubDownloadUrl}/${version}/${downloadFileName}`, false)
    }

    // Verify installation by checking the version of the installed tool
    task.execSync(toolName, 'version --client')
    task.setResult(task.TaskResult.Succeeded, '')
  } catch (error) {
    task.setResult(task.TaskResult.Failed, (error as Error).message)
  }
}

/**
 * Installs ArgoCD from the server download endpoint.
 * Falls back to the GitHub release only if the server URL returns a non-2xx HTTP response,
 * letting all other errors propagate.
 *
 * @param version Resolved version to install.
 * @param serverUrl Base ArgoCD server URL.
 */
async function installFromServer(version: string, serverUrl: string): Promise<void> {
  const serverDownloadUrl = new URL(`download/${downloadFileName}`, serverUrl).href
  try {
    await utils.installTool(toolName, version, serverDownloadUrl, false)
  } catch (error) {
    if (!utils.isHttpError(error)) {
      throw error
    }
    task.warning(`Server download URL not accessible, falling back to GitHub release for ${version}`)
    await utils.installTool(toolName, version, `${githubDownloadUrl}/${version}/${downloadFileName}`, false)
  }
}

/**
 * Reads ArgoCD endpoint details from a service connection and exports the
 * required CLI environment variables.
 *
 * @param connectionEndpoint Azure DevOps service connection name or ID.
 * @returns Normalized base server URL including non-root path, if present.
 */
export function getEndpointDetails(connectionEndpoint: string): string {
  const serverUrl = task.getEndpointUrlRequired(connectionEndpoint)
  const apitoken = task.getEndpointAuthorizationParameterRequired(connectionEndpoint, 'apitoken')
  const url = new URL(serverUrl)
  const path = url.pathname === '/' ? '' : url.pathname

  task.setVariable('ARGOCD_SERVER', url.host + path)
  task.setVariable('ARGOCD_AUTH_TOKEN', apitoken, true)
  return new URL(url.pathname, url.origin).href
}

/**
 * Resolves the ArgoCD version to install from task input.
 *
 * @param inputVersion Version input provided by the user.
 * @param serverUrl Optional server URL used when `inputVersion` is `server`.
 * @returns Resolved version string to install.
 */
export async function resolveVersion(inputVersion: string, serverUrl?: string): Promise<string> {
  task.debug(`Requested version: ${inputVersion}`)

  switch (inputVersion.toLowerCase()) {
    case 'latest':
      return utils.getLatestVersion(repo)
    case 'server':
      if (!serverUrl) throw new Error('Server URL is required when version is server')
      return getServerVersion(serverUrl)
    default:
      return inputVersion
  }
}

/**
 * Fetches and parses ArgoCD server version from the API.
 *
 * @param url Base ArgoCD server URL.
 * @returns Server-reported semantic version without build metadata.
 */
export async function getServerVersion(url: string): Promise<string> {
  task.debug(`Resolving version from: ${url}`)

  try {
    const versionUrl = new URL('api/version', url).href
    const response = await fetch(new Request(versionUrl, { method: 'GET' }))
    const data = (await response.json()) as { Version?: string }
    const versionFull = data.Version
    const version = versionFull?.split('+')[0]

    if (!version) {
      throw new Error(`Failed to parse version from server ${url}`)
    }

    task.debug(`Resolved version: ${version}`)
    return version
  } catch (error) {
    throw new Error(`Failed to resolve version from server ${url}`, { cause: error })
  }
}
