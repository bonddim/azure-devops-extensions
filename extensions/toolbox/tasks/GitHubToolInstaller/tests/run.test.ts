import * as task from 'azure-pipelines-task-lib/task'
import { describe, expect, it, vi } from 'vitest'

const { mockInstallTool, mockEvaluateVersions, mockOctokitArgs, mockOctokit } = vi.hoisted(() => {
  return {
    mockInstallTool: vi.fn<(tool: string, version: string, url: string, extract: boolean) => Promise<void>>(),
    mockEvaluateVersions: vi.fn<(versions: string[], spec: string) => string>(),
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
})

vi.mock('@bonddim/utils', () => ({
  installTool: mockInstallTool,
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
vi.mock('azure-pipelines-tool-lib/tool', () => ({
  evaluateVersions: mockEvaluateVersions,
}))

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

function mockRelease(tag: string, assets: ReturnType<typeof makeAsset>[]) {
  return { data: { tag_name: tag, assets } }
}

// ─── run ────────────────────────────────────────────────────────────

describe('run', () => {
  describe('authentication', () => {
    it('should use GitHub service connection token', async () => {
      mockInputs({ repository: 'owner/tool', version: 'latest', connection: 'my-conn' })
      mockedTask.getEndpointAuthorizationParameter.mockReturnValue('gh_servicetoken')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockOctokitArgs.captured).toEqual({ auth: 'gh_servicetoken' })
      expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, expect.any(String), true)
    })

    it('should fall back to GITHUB_TOKEN env var', async () => {
      mockInputs({ repository: 'owner/tool', version: 'latest' })
      mockedTask.getVariable.mockReturnValue('gh_envtoken')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', LINUX_ASSETS))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockOctokitArgs.captured).toEqual({ auth: 'gh_envtoken' })
    })

    it('should fail when no authentication is available', async () => {
      mockInputs({ repository: 'owner/tool', version: 'latest' })
      mockedTask.getEndpointAuthorizationParameter.mockReturnValue(undefined)
      mockedTask.getVariable.mockReturnValue(undefined)

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(
        task.TaskResult.Failed,
        expect.stringContaining('GitHub authentication is required'),
        true,
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
      expect(mockInstallTool).toHaveBeenCalledWith('tool', '2.0.0', expect.any(String), true)
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
      mockEvaluateVersions.mockReturnValue('1.5.0')
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
      expect(mockInstallTool).toHaveBeenCalledWith('tool', '1.5.0', expect.any(String), true)
    })

    it('should skip draft and prerelease when matching version ranges', async () => {
      mockInputs({ repository: 'owner/tool', version: '1.x' })
      mockedTask.getVariable.mockReturnValue('token')
      mockEvaluateVersions.mockReturnValue('1.5.0')
      mockOctokit.rest.repos.listReleases.mockResolvedValue({
        data: [
          { tag_name: 'v1.6.0', draft: true, prerelease: false, assets: LINUX_ASSETS },
          { tag_name: 'v1.5.1', draft: false, prerelease: true, assets: LINUX_ASSETS },
          { tag_name: 'v1.5.0', draft: false, prerelease: false, assets: LINUX_ASSETS },
        ],
      })
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith('tool', '1.5.0', expect.any(String), true)
    })

    it('should fail when no release matches the version range', async () => {
      mockInputs({ repository: 'owner/tool', version: '3.x' })
      mockedTask.getVariable.mockReturnValue('token')
      mockEvaluateVersions.mockReturnValue('')
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
        true,
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
      )
    })

    it('should detect non-archive binary files', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [makeAsset('tool-linux-amd64'), makeAsset('tool-darwin-amd64')]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith('tool', '1.0.0', expect.stringContaining('tool-linux-amd64'), false)
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
        true,
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
        true,
      )
    })

    it('should not select checksum files as the tool asset', async () => {
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
      )
    })

    it('should prefer musl over glibc when both linux assets present', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [
        makeAsset('tool-linux-amd64.tar.gz'),
        makeAsset('tool-linux-musl-amd64.tar.gz'),
        makeAsset('tool-darwin-amd64.tar.gz'),
      ]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith(
        'tool',
        '1.0.0',
        expect.stringContaining('tool-linux-musl-amd64.tar.gz'),
        true,
      )
    })

    it('should use glibc asset when no musl variant available', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [makeAsset('tool-linux-amd64.tar.gz'), makeAsset('tool-darwin-amd64.tar.gz')]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))
      mockInstallTool.mockResolvedValue(undefined)

      await run()

      expect(mockInstallTool).toHaveBeenCalledWith(
        'tool',
        '1.0.0',
        expect.stringContaining('tool-linux-amd64.tar.gz'),
        true,
      )
    })

    it('should match x86 asset on Windows ia32 arch', async () => {
      const winInstallTool = vi.fn().mockResolvedValue(undefined)
      vi.resetModules()
      vi.doMock('node:os', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:os')>()
        return { ...actual, platform: () => 'win32', arch: () => 'ia32' }
      })
      vi.doMock('@bonddim/utils', () => ({
        installTool: winInstallTool,
        isWindows: vi.fn().mockReturnValue(true),
      }))
      vi.doMock('@octokit/rest', () => ({
        Octokit: class {
          rest = mockOctokit.rest
        },
      }))

      const { run: ia32Run } = await import('../src/run')

      mockedTask.getInput.mockImplementation((name: string) => {
        const inputs: Record<string, string> = { repository: 'owner/tool' }
        return inputs[name]
      })
      mockedTask.getVariable.mockReturnValue('token')
      const assets = [
        makeAsset('tool-windows-x64.zip'),
        makeAsset('tool-windows-x86.zip'),
        makeAsset('tool-linux-amd64.tar.gz'),
      ]
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', assets))

      await ia32Run()

      expect(winInstallTool).toHaveBeenCalledWith(
        'tool',
        '1.0.0',
        expect.stringContaining('tool-windows-x86.zip'),
        true,
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
        true,
      )
    })

    it('should fail when API call throws', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockRejectedValue(new Error('API rate limit exceeded'))

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'API rate limit exceeded', true)
    })

    it('should fail when installTool throws', async () => {
      mockInputs({ repository: 'owner/tool' })
      mockedTask.getVariable.mockReturnValue('token')
      mockOctokit.rest.repos.getLatestRelease.mockResolvedValue(mockRelease('v1.0.0', LINUX_ASSETS))
      mockInstallTool.mockRejectedValue(new Error('download failed'))

      await run()

      expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'download failed', true)
    })
  })
})
