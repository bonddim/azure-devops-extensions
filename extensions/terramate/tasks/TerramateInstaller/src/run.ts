import * as os from 'node:os'
import * as utils from '@bonddim/utils'
import * as taskLib from 'azure-pipelines-task-lib/task'
import { cleanVersion } from 'azure-pipelines-tool-lib/tool'

const toolName = 'terramate'
const repo = 'terramate-io/terramate'
const fileArch = os.arch() === 'x64' ? 'x86_64' : os.arch()
const fileExtension = utils.isWindows() ? 'zip' : 'tar.gz'
const filePlatform = utils.isWindows() ? 'windows' : os.platform()

/**
 * Installs Terramate CLI based on task inputs and configures task variables.
 *
 * Supports explicit versions and latest release resolution.
 */
export async function run() {
  try {
    const inputVersion = taskLib.getInput('version') ?? 'latest'

    const resolvedVersion = inputVersion.toLowerCase() === 'latest' ? await utils.getLatestVersion(repo) : inputVersion
    const version = cleanVersion(resolvedVersion) || resolvedVersion
    const downloadUrl = `https://github.com/${repo}/releases/download/v${version}/${toolName}_${version}_${filePlatform}_${fileArch}.${fileExtension}`

    // Install the tool from GitHub releases
    await utils.installTool(toolName, version, downloadUrl, true)

    // Verify installation by checking the version of the installed tool
    taskLib.execSync(toolName, 'version')
    taskLib.setResult(taskLib.TaskResult.Succeeded, '')
  } catch (error) {
    taskLib.setResult(taskLib.TaskResult.Failed, (error as Error).message)
  }
}
