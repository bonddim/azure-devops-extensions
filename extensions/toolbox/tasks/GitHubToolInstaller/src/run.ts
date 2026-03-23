import * as os from 'node:os'
import * as utils from '@bonddim/utils'
import { Octokit } from '@octokit/rest'
import * as taskLib from 'azure-pipelines-task-lib/task'
import * as semver from 'semver'

/** Platform keywords for asset matching, keyed by os.platform() */
const PLATFORM_KEYWORDS: Record<string, string[]> = {
  linux: ['linux'],
  darwin: ['darwin', 'macos', 'osx'],
  win32: ['windows', 'win'],
}

/** Architecture keywords for asset matching, keyed by os.arch() */
const ARCH_KEYWORDS: Record<string, string[]> = {
  x64: ['amd64', 'x86_64', 'x64'],
  arm64: ['arm64', 'aarch64'],
  ia32: ['x86', 'i386', '386'],
}

/** Archive file extensions */
const ARCHIVE_EXTENSIONS = ['.tar.gz', '.tgz', '.zip', '.7z', '.tar']

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

interface ReleaseData {
  tag_name: string
  assets: ReleaseAsset[]
}

/**
 * Resolve GitHub auth token from service connection or environment variable.
 * Throws if neither is available.
 */
function getAuthToken(connection: string | undefined): string {
  if (connection) {
    // Try AccessToken first (OAuth-based connections), then Token (PAT-based)
    const token =
      taskLib.getEndpointAuthorizationParameter(connection, 'AccessToken', true) ??
      taskLib.getEndpointAuthorizationParameter(connection, 'Token', true)
    if (token) return token
  }

  const envToken = taskLib.getVariable('GITHUB_TOKEN')
  if (envToken) return envToken

  throw new Error(
    'GitHub authentication is required. Provide a GitHub service connection via the connection input or set the GITHUB_TOKEN environment variable.',
  )
}

/**
 * Resolve the target release using Octokit.
 * Supports "latest", exact version tags, and semver ranges.
 */
async function resolveRelease(octokit: Octokit, owner: string, repo: string, version: string): Promise<ReleaseData> {
  if (version.toLowerCase() === 'latest') {
    const { data } = await octokit.rest.repos.getLatestRelease({ owner, repo })
    return data
  }

  // Check if it's a semver range (not an exact version)
  if (!semver.valid(version) && semver.validRange(version)) {
    const { data: allReleases } = await octokit.rest.repos.listReleases({ owner, repo, per_page: 100 })
    const stableReleases = allReleases.filter((r) => !r.draft && !r.prerelease)
    const cleanTags = stableReleases.map((r) => semver.clean(r.tag_name) || r.tag_name)
    const matched = semver.maxSatisfying(cleanTags, version)

    if (!matched) {
      throw new Error(
        `No release found matching version range '${version}'. Available versions: ${cleanTags.join(', ')}`,
      )
    }

    return stableReleases.find((r) => (semver.clean(r.tag_name) || r.tag_name) === matched)!
  }

  // Exact version - try as-is first, then with 'v' prefix
  try {
    const { data } = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag: version })
    return data
  } catch {
    const altTag = version.startsWith('v') ? version.slice(1) : `v${version}`
    const { data } = await octokit.rest.repos.getReleaseByTag({ owner, repo, tag: altTag })
    return data
  }
}

/** Check if a filename is an archive */
function isArchiveFile(name: string): boolean {
  const lower = name.toLowerCase()
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Simple glob match supporting * wildcard */
function globMatch(pattern: string, name: string): boolean {
  const regex = new RegExp(`^${pattern.replaceAll('*', '.*').replaceAll('?', '.')}$`, 'i')
  return regex.test(name)
}

/**
 * Find the best matching asset for the current platform and architecture.
 * Filters by platform/arch keywords and optionally by a user-provided glob pattern.
 */
function matchAsset(assets: ReleaseAsset[], filePattern: string | undefined): ReleaseAsset {
  const platform = os.platform()
  const arch = os.arch()
  const platformKeywords = PLATFORM_KEYWORDS[platform] ?? [platform]
  const archKeywords = ARCH_KEYWORDS[arch] ?? [arch]

  // Match by platform AND arch keywords
  let matched = assets.filter((a) => {
    const lower = a.name.toLowerCase()
    const hasPlatform = platformKeywords.some((k) => lower.includes(k))
    const hasArch = archKeywords.some((k) => lower.includes(k))
    return hasPlatform && hasArch
  })

  // Apply filePattern filter if provided
  if (filePattern && matched.length > 1) {
    const filtered = matched.filter((a) => globMatch(filePattern, a.name))
    if (filtered.length > 0) matched = filtered
  }

  // On Linux, prefer musl (statically linked) over glibc builds — works on all Linux distros including Alpine
  if (matched.length > 1 && platform === 'linux') {
    const musl = matched.filter((a) => a.name.toLowerCase().includes('musl'))
    if (musl.length > 0) matched = musl
  }

  // Prefer appropriate archive type for the platform
  if (matched.length > 1) {
    const preferredExt = utils.isWindows() ? '.zip' : '.tar.gz'
    const preferred = matched.filter((a) => a.name.toLowerCase().endsWith(preferredExt))
    if (preferred.length > 0) matched = preferred
  }

  // If still multiple, prefer archives over bare binaries
  if (matched.length > 1) {
    const archives = matched.filter((a) => isArchiveFile(a.name))
    if (archives.length > 0) matched = archives
  }

  if (matched.length === 0) {
    const available = assets.map((a) => a.name).join(', ')
    throw new Error(
      `No matching asset found for platform '${platform}' and architecture '${arch}'. Available assets: ${available}`,
    )
  }

  if (matched.length > 1) {
    const names = matched.map((a) => a.name).join(', ')
    throw new Error(`Multiple matching assets found: ${names}. Use the filePattern input to narrow down the selection.`)
  }

  return matched[0]!
}

/**
 * Installs a tool from GitHub releases based on task inputs.
 *
 * Uses the GitHub API via Octokit to list release assets and automatically
 * matches the right binary for the current platform/architecture.
 * Supports exact versions and semver ranges.
 */
export async function run() {
  try {
    const repository = taskLib.getInput('repository', true)
    if (!repository) throw new Error("Input 'repository' is required and must be in the format 'owner/repo'.")
    const inputVersion = taskLib.getInput('version') ?? 'latest'
    const connection = taskLib.getInput('connection')
    const filePattern = taskLib.getInput('filePattern')

    // Authenticate
    const token = getAuthToken(connection)
    const octokit = new Octokit({ auth: token })

    // Parse owner/repo
    const [owner, repo] = repository.split('/')
    if (!owner || !repo) {
      throw new Error(`Invalid repository format '${repository}'. Expected 'owner/repo'.`)
    }

    // Resolve release
    const release = await resolveRelease(octokit, owner, repo, inputVersion)
    const version = semver.clean(release.tag_name) || release.tag_name

    // Match the right asset
    const asset = matchAsset(release.assets, filePattern)
    taskLib.debug(`Matched asset: ${asset.name}`)

    const isArchive = isArchiveFile(asset.name)

    await utils.installTool(repo, version, asset.browser_download_url, isArchive)

    taskLib.setResult(taskLib.TaskResult.Succeeded, `Installed ${repo} ${version}`, true)
  } catch (error) {
    taskLib.setResult(taskLib.TaskResult.Failed, (error as Error).message, true)
  }
}
