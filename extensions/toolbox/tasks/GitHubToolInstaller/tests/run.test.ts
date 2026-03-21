import * as task from 'azure-pipelines-task-lib/task'
import { describe, expect, it, vi } from 'vitest'

const { mockInstallTool, mockDownloadChecksumFile, mockValidateChecksum, mockOctokitArgs, mockOctokit } = vi.hoisted(
  () => {
    return {
      mockInstallTool:
        vi.fn<
          (
            tool: string,
            version: string,
            url: string,
            extract: boolean,
            validate?: (filePath: string) => Promise<void>,
          ) => Promise<void>
        >(),
      mockDownloadChecksumFile: vi.fn<(url: string) => Promise<Map<string, string>>>(),
      mockValidateChecksum: vi.fn<(filePath: string, expectedHash: string) => Promise<void>>(),
      mockOctokitArgs: { captured: undefined as unknown },
      mockOctokit: {
        rest: {
          repos: {
            getLatestRelease: vi.fn(),
            getReleaseByTag: vi.fn(),
            listReleases: vi.fn(),
          },
        },
      },
    }
  },
)

vi.mock('@bonddim/utils', () => ({
  installTool: mockInstallTool,
  downloadChecksumFile: mockDownloadChecksumFile,
  validateChecksum: mockValidateChecksum,
  isWindows: vi.fn().mockReturnValue(false),
}))
vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = mockOctokit.rest
    constructor(opts: unknown) {
      mockOctokitArgs.captured = opts
    }
  },
}))
vi.mock('azure-pipelines-task-lib/task')
vi.mock('azure-pipelines-tool-lib/tool', async (importOriginal) => {
  const actual = await importOriginal<typeof import('azure-pipelines-tool-lib/tool')>()
  return { ...actual, findLocalTool: vi.fn() }
})

const mockedTask = vi.mocked(task)

import { run } from '../src/run'

// ─── helpers ────────────────────────────────────────────────────────

function mockInputs(inputs: Record<string, string | undefined>) {
  mockedTask.getInput.mockImplementation((name: string) => inputs[name] ?? undefined)
}

function makeAsset(name: string, url?: string) {
  return { name, browser_download_url: url ?? `https://github.com/releases/download/v1.0.0/${name}` }
}

const LINUX_ASSETS = [
  makeAsset('tool-linux-amd64.tar.gz'),
  makeAsset('tool-darwin-amd64.tar.gz'),
  makeAsset('tool-windows-amd64.zip'),
  makeAsset('tool-linux-arm64.tar.gz'),
]

const ASSETS_WITH_CHECKSUMS = [
  ...LINUX_ASSETS,
  makeAsset('checksums.txt', 'https://github.com/releases/download/v1.0.0/checksums.txt'),
]

function mockRelease(tag: string, assets: ReturnType<typeof makeAsset>[]) {
  return { data: { tag_name: tag, assets } }
}

// ─── run ────────────────────────────────────────────────────────────

describe('run', () => {
  describe('authentication', () => {
    it('should use GitHub service connection token', async () => {
      mockInputs({ repository: 'owner/tool', version: 'latest', githubConnection: 'my-conn' })
      mockedTask.getEndpointAuthorizationParameter.mockReturnValue('ghp_servicetoken')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockOctokitArgs.captured).toEqual({ auth: 'ghp_servicetoken' })
      expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, expect.any(String))
    })

    it('should fall back to GITHUB_TOKEN env var', async () => {
      mockInputs({ repository: 'owner/tool', version: 'latest' })
      mockedTask.getVariable.mockReturnValue('ghp_envtoken')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockOctokitArgs.captured).toEqual({ auth: 'ghp_envtoken' })
    })

    it('should fail when no authentication is available', async () => {
      mockInputs({ repository: 'owner/tool', version: 'latest' })
      mockedTask.getEndpointAuthorizationParameter.mockReturnValue(undefined)
      mockedTask.getVariable.mockReturnValue(undefined)

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(
        task.TaskResult.Failed,
        expect.stringContaining('GitHub authentication is required'),
      )
    })
  })

  describe('version resolution', () => {
    it('should call getLatestRelease for latest version', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v2.0.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockOctokit.rest.repos.getLatestRelease).toHaveBeenCalledWith({ owner: 'owner', repo: 'tool' })
      expect(mockInstallTool).toHaveBeenCalledWith('tool', '2.0.0', expect.any(String), true, undefined)
    })

    it('should call getReleaseByTag for exact version', async () => {
      mockInputs({ repository: 'owner/tool', version: 'v1.5.0' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getReleaseByTag.mockResolvedValue(mockRelease('v1.5.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'tool',
        tag: 'v1.5.0',
      })
    })

    it('should try alternative tag prefix when exact version not found', async () => {
      mockInputs({ repository: 'owner/tool', version: '1.5.0' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getReleaseByTag
        .mockRejectedValueOnce(new Error('Not Found'))
        .mockResolvedValueOnce(mockRelease('v1.5.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'tool',
        tag: '1.5.0',
      })
      expect(mockOctokit.rest.repos.getReleaseByTag).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'tool',
        tag: 'v1.5.0',
      })
    })

    it('should use semver range matching for version ranges', async () => {
      mockInputs({ repository: 'owner/tool', version: '1.x' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          { tag_name: 'v2.0.0', draft: false, prerelease: false, assets: LINUX_ASSETS },
          { tag_name: 'v1.5.0', draft: false, prerelease: false, assets: LINUX_ASSETS },
          { tag_name: 'v1.4.0', draft: false, prerelease: false, assets: LINUX_ASSETS },
          { tag_name: 'v0.9.0', draft: false, prerelease: false, assets: LINUX_ASSETS },
        ],
      })
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockOctokit.rest.repos.listReleases).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'tool',
        per_page: 100,
      })
      expect(mockInstallTool).toHaveBeenCalledWith('tool', '1.5.0', expect.any(String), true, undefined)
    })

    it('should skip draft and prerelease when matching version ranges', async () => {
      mockInputs({ repository: 'owner/tool', version: '1.x' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          { tag_name: 'v1.6.0', draft: true, prerelease: false, assets: LINUX_ASSETS },
          { tag_name: 'v1.5.1', draft: false, prerelease: true, assets: LINUX_ASSETS },
          { tag_name: 'v1.5.0', draft: false, prerelease: false, assets: LINUX_ASSETS },
        ],
      })
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith('tool', '1.5.0', expect.any(String), true, undefined)
    })

    it('should fail when no release matches the version range', async () => {
      mockInputs({ repository: 'owner/tool', version: '3.x' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          { tag_name: 'v2.0.0', draft: false, prerelease: false, assets: LINUX_ASSETS },
          { tag_name: 'v1.0.0', draft: false, prerelease: false, assets: LINUX_ASSETS },
        ],
      })

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(
        task.TaskResult.Failed,
        expect.stringContaining("No release found matching version range '3.x'"),
      )
    })
  })

  describe('asset matching', () => {
    it('should select the correct linux/amd64 asset', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith(
        'tool',
        '1.0.0',
        expect.stringContaining('tool-linux-amd64.tar.gz'),
        true,
        undefined,
      )
    })

    it('should detect non-archive binary files', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [makeAsset('tool-linux-amd64'), makeAsset('tool-darwin-amd64')]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith(
        'tool',
        '1.0.0',
        expect.stringContaining('tool-linux-amd64'),
        false,
        undefined,
      )
    })

    it('should use filePattern to narrow down multiple matches', async () => {
      mockInputs({ repository: 'owner/tool', filePattern: '*.tar.gz' })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [
        makeAsset('tool-linux-amd64.tar.gz'),
        makeAsset('tool-linux-amd64.deb'),
        makeAsset('tool-darwin-amd64.tar.gz'),
      ]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith(
        'tool',
        '1.0.0',
        expect.stringContaining('tool-linux-amd64.tar.gz'),
        true,
        undefined,
      )
    })

    it('should fail when no asset matches platform/arch', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [makeAsset('tool-freebsd-riscv64.tar.gz')]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(
        task.TaskResult.Failed,
        expect.stringContaining('No matching asset found'),
      )
    })

    it('should fail when multiple assets match without disambiguation', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [makeAsset('tool-linux-amd64.tar.gz'), makeAsset('tool-linux-x64.tar.gz')]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(
        task.TaskResult.Failed,
        expect.stringContaining('Multiple matching assets found'),
      )
    })

    it('should exclude checksum files from asset matching', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [
        makeAsset('tool-linux-amd64.tar.gz'),
        makeAsset('tool-linux-amd64.tar.gz.sha256'),
        makeAsset('checksums.txt'),
      ]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith(
        'tool',
        '1.0.0',
        expect.stringContaining('tool-linux-amd64.tar.gz'),
        true,
        expect.any(Function),
      )
    })

    it('should select .zip on Windows platform', async () => {
      const winInstallTool = vi.fn().mockResolvedValue(undefined)
      vi.resetModules()
      vi.doMock('node:os', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:os')>()
        return { ...actual, platform: () => 'win32', arch: () => 'x64' }
      })
      vi.doMock('@bonddim/utils', () => ({
        installTool: winInstallTool,
        downloadChecksumFile: vi.fn(),
        validateChecksum: vi.fn(),
        isWindows: vi.fn().mockReturnValue(true),
      }))
      vi.doMock('@octokit/rest', () => ({
        Octokit: class {
          rest = mockOctokit.rest
        },
      }))

      const { run: winRun } = await import('../src/run')

      mockedTask.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { repository: 'owner/tool' }
        return inputs[name]
      })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [
        makeAsset('tool-windows-amd64.tar.gz'),
        makeAsset('tool-windows-amd64.zip'),
        makeAsset('tool-linux-amd64.tar.gz'),
      ]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))

      await winRun()

      expect(winInstallTool).toHaveBeenCalledWith(
        'tool',
        '1.0.0',
        expect.stringContaining('tool-windows-amd64.zip'),
        true,
        undefined,
      )
    })
  })

  describe('checksum validation', () => {
    it('should auto-detect checksum file and pass validator', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', ASSETS_WITH_CHECKSUMS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith('tool', '1.0.0', expect.any(String), true, expect.any(Function))
    })

    it('should execute checksum validation when validator is invoked', async () => {
      const checksums = new Map([['tool-linux-amd64.tar.gz', 'abc123']])
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', ASSETS_WITH_CHECKSUMS))
      mockInstallTool.mockImplementation(async (_tool, _version, _url, _extract, validate) => {
        if (validate) await validate('/tmp/downloaded-file')
      })
      mockDownloadChecksumFile.mockResolvedValue(checksums)
      mockValidateChecksum.mockResolvedValue(undefined)

      await run()

      expect(mockDownloadChecksumFile).toHaveBeenCalledWith('https://github.com/releases/download/v1.0.0/checksums.txt')
      expect(mockValidateChecksum).toHaveBeenCalledWith('/tmp/downloaded-file', 'abc123')
    })

    it('should skip checksum validation when no checksum file in assets', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith('tool', '1.0.0', expect.any(String), true, undefined)
    })

    it('should fail when checksum entry not found for the asset', async () => {
      const checksums = new Map([['other-file.tar.gz', 'abc123']])
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', ASSETS_WITH_CHECKSUMS))
      mockInstallTool.mockImplementation(async (_tool, _version, _url, _extract, validate) => {
        if (validate) await validate('/tmp/downloaded-file')
      })
      mockDownloadChecksumFile.mockResolvedValue(checksums)

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(
        task.TaskResult.Failed,
        expect.stringContaining('Checksum entry not found'),
      )
    })
  })

  describe('error handling', () => {
    it('should fail when repository format is invalid', async () => {
      mockInputs({ repository: 'invalid-repo' })
      mockedTask.getVariable.mockReturnValue('token')

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(
        task.TaskResult.Failed,
        expect.stringContaining('Invalid repository format'),
      )
    })

    it('should fail when API call throws', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockRejectedValue(new Error('API rate limit exceeded'))

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'API rate limit exceeded')
    })

    it('should fail when installTool throws', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', LINUX_ASSETS))
      mockInstallTool.mockRejectedValue(new Error('download failed'))

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'download failed')
    })
  })
})
