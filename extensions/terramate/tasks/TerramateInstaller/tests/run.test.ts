import * as task from 'azure-pipelines-task-lib/task'
import { describe, expect, it, vi } from 'vitest'

const { mockGetLatestVersion, mockInstallTool } = vi.hoisted(() => ({
  mockGetLatestVersion: vi.fn<(repo: string) => Promise<string>>(),
  mockInstallTool: vi.fn<(tool: string, version: string, url: string, extract: boolean) => Promise<void>>(),
}))

vi.mock('@bonddim/utils', () => ({
  getLatestVersion: mockGetLatestVersion,
  installTool: mockInstallTool,
  isWindows: vi.fn().mockReturnValue(false),
}))
vi.mock('azure-pipelines-task-lib/task')
vi.mock('azure-pipelines-tool-lib/tool', async (importOriginal) => {
  const actual = await importOriginal<typeof import('azure-pipelines-tool-lib/tool')>()
  return { ...actual, findLocalTool: vi.fn() }
})

const mockedTask = vi.mocked(task)

import { run } from '../src/run'

// ─── run ─────────────────────────────────────────────────────────────

describe('run', () => {
  it('should install latest version when no version input', async () => {
    mockedTask.getInput.mockReturnValue(undefined)
    mockGetLatestVersion.mockResolvedValue('v0.14.0')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockGetLatestVersion).toHaveBeenCalledWith('terramate-io/terramate')
    expect(mockInstallTool).toHaveBeenCalledWith(
      'terramate',
      '0.14.0',
      expect.stringContaining('terramate_0.14.0_linux_x86_64.tar.gz'),
      true,
    )
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should install explicit version with v prefix stripped', async () => {
    mockedTask.getInput.mockReturnValue('v0.14.0')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockGetLatestVersion).not.toHaveBeenCalled()
    expect(mockInstallTool).toHaveBeenCalledWith(
      'terramate',
      '0.14.0',
      expect.stringContaining('v0.14.0/terramate_0.14.0_'),
      true,
    )
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should install explicit version without v prefix unchanged', async () => {
    mockedTask.getInput.mockReturnValue('0.14.0')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockInstallTool).toHaveBeenCalledWith(
      'terramate',
      '0.14.0',
      expect.stringContaining('v0.14.0/terramate_0.14.0_'),
      true,
    )
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should always extract the downloaded archive', async () => {
    mockedTask.getInput.mockReturnValue('0.14.0')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockInstallTool).toHaveBeenCalledWith('terramate', expect.any(String), expect.any(String), true)
  })

  it('should use tar.gz archive on Linux', async () => {
    mockedTask.getInput.mockReturnValue('0.14.0')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockInstallTool).toHaveBeenCalledWith('terramate', '0.14.0', expect.stringContaining('.tar.gz'), true)
  })

  it('should verify installation by running terramate version', async () => {
    mockedTask.getInput.mockReturnValue('0.14.0')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockedTask.execSync).toHaveBeenCalledWith('terramate', 'version')
  })

  it('should fail when getLatestVersion throws', async () => {
    mockedTask.getInput.mockReturnValue(undefined)
    mockGetLatestVersion.mockRejectedValue(new Error('rate limited'))

    await run()

    expect(mockInstallTool).not.toHaveBeenCalled()
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'rate limited')
  })

  it('should fail when installTool throws', async () => {
    mockedTask.getInput.mockReturnValue('0.14.0')
    mockInstallTool.mockRejectedValue(new Error('download failed'))

    await run()

    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'download failed')
  })

  it('should use Windows-specific archive name on Windows platform', async () => {
    const winInstallTool = vi.fn().mockResolvedValue(undefined)
    vi.resetModules()
    vi.doMock('@bonddim/utils', () => ({
      getLatestVersion: vi.fn(),
      installTool: winInstallTool,
      isWindows: vi.fn().mockReturnValue(true),
    }))

    const { run: winRun } = await import('../src/run')

    mockedTask.getInput.mockReturnValue('0.14.0')

    await winRun()

    expect(winInstallTool).toHaveBeenCalledWith(
      'terramate',
      '0.14.0',
      expect.stringContaining('windows_x86_64.zip'),
      true,
    )
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })
})
