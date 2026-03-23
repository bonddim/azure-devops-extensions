import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as taskLib from 'azure-pipelines-task-lib/task'
import * as toolLib from 'azure-pipelines-tool-lib/tool'

/**
 * Checks if the current platform is Windows
 * This is used to determine file naming and permissions during installation
 * @returns true if running on Windows, false otherwise
 */
export const isWindows = () => os.platform() === 'win32'

/**
 * Returns true when the error originated from a non-2xx HTTP response in downloadTool
 * @param error error to inspect
 */
export function isHttpError(error: unknown): boolean {
  return error instanceof Error && 'httpStatusCode' in error
}

/**
 * Install a tool from a download URL, optionally extracting if it's an archive
 *
 * @param tool tool name to install
 * @param version tool version to install
 * @param downloadUrl url of tool to download
 * @param extract whether the downloaded file is an archive that needs extraction
 */
export async function installTool(tool: string, version: string, downloadUrl: string, extract: boolean): Promise<void> {
  let cachedPath = toolLib.findLocalTool(tool, version)

  if (!cachedPath) {
    try {
      const filePath = await toolLib.downloadTool(downloadUrl, undefined, undefined, {
        connection: 'close',
        'User-Agent': 'AzureDevOps',
      })

      const fileExtension = path.extname(new URL(downloadUrl).pathname.toLowerCase())

      cachedPath = extract
        ? await installFromArchive(filePath, tool, version, fileExtension)
        : await installFromFile(filePath, tool, version)
    } catch (error) {
      if (isHttpError(error)) throw error
      throw new Error(`Failed to install tool ${tool} version ${version} from ${downloadUrl}`, { cause: error })
    }
  }

  // Add the tool to PATH
  toolLib.prependPath(cachedPath)
  // Verify tool is on PATH after installation
  taskLib.which(tool, true)
}

/**
 * Find the directory inside an extracted archive that contains the tool executable.
 * Archives could place the binary in a nested directory (e.g. `tool-1.0/bin/tool`).
 * Falls back to `baseDir` if the executable is not found.
 *
 * @param baseDir root of the extracted archive
 * @param toolName tool name to look for (`.exe` is appended automatically on Windows)
 * @returns directory that contains the executable, or `baseDir` if not found
 */
function findToolDir(baseDir: string, toolName: string): string {
  const execName = isWindows() ? `${toolName}.exe` : toolName
  const match = taskLib.find(baseDir).find((p) => path.basename(p) === execName && fs.statSync(p).isFile())
  taskLib.debug(`Searching for ${execName} in ${baseDir}, found: ${match}`)
  return match ? path.dirname(match) : baseDir
}

/**
 * Extract and cache a tool from an archive file
 *
 * @param filePath path to the downloaded archive file
 * @param tool tool name to cache
 * @param version tool version to cache
 * @param extension file extension including dot (e.g., `.zip`, `.7z`, `.tar`, `.gz`)
 * @returns path to the cached tool
 */
async function installFromArchive(filePath: string, tool: string, version: string, extension: string): Promise<string> {
  let extractPath: string

  if (extension === '.zip') {
    extractPath = await toolLib.extractZip(filePath)
  } else if (extension === '.7z') {
    extractPath = await toolLib.extract7z(filePath)
  } else {
    extractPath = await toolLib.extractTar(filePath)
  }

  return toolLib.cacheDir(findToolDir(extractPath, tool), tool, version)
}

/**
 * Install and cache a downloaded executable tool file
 *
 * @param filePath path to the downloaded tool file
 * @param tool tool name to cache
 * @param version tool version to cache
 * @returns path to the cached tool
 */
async function installFromFile(filePath: string, tool: string, version: string): Promise<string> {
  if (isWindows()) {
    return toolLib.cacheFile(filePath, `${tool}.exe`, tool, version)
  }

  await fs.promises.chmod(filePath, 0o755)
  return toolLib.cacheFile(filePath, tool, tool, version)
}
