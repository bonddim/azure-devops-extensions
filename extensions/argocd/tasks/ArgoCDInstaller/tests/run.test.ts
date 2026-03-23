import * as task from 'azure-pipelines-task-lib/task'
import * as tool from 'azure-pipelines-tool-lib/tool'
import { describe, expect, it, vi } from 'vitest'

const { mockGetLatestVersion, mockInstallTool } = vi.hoisted(() => ({
  mockGetLatestVersion: vi.fn<(url: string) => Promise<string>>(),
  mockInstallTool: vi.fn<(tool: string, version: string, url: string, extract: boolean) => Promise<void>>(),
}))

vi.mock('@bonddim/utils', () => ({
  getLatestVersion: mockGetLatestVersion,
  installTool: mockInstallTool,
  isWindows: vi.fn().mockReturnValue(false),
  isHttpError: (error: unknown) => error instanceof Error && 'httpStatusCode' in error,
}))
vi.mock('azure-pipelines-task-lib/task')
vi.mock('azure-pipelines-tool-lib/tool', async (importOriginal) => {
  const actual = await importOriginal<typeof import('azure-pipelines-tool-lib/tool')>()
  return { ...actual, findLocalTool: vi.fn() }
})

const mockedTask = vi.mocked(task)
const mockedTool = vi.mocked(tool)

import { getEndpointDetails, getServerVersion, resolveVersion, run } from '../src/run'

// ─── getEndpointDetails ──────────────────────────────────────────────

describe('getEndpointDetails', () => {
  it('should set ARGOCD_SERVER and ARGOCD_AUTH_TOKEN for simple URL', () => {
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')

    const result = getEndpointDetails('myconn')

    expect(result).toBe('https://argocd.example.com/')
    expect(mockedTask.setVariable).toHaveBeenCalledWith('ARGOCD_SERVER', 'argocd.example.com')
    expect(mockedTask.setVariable).toHaveBeenCalledWith('ARGOCD_AUTH_TOKEN', 'token123')
  })

  it('should include pathname in ARGOCD_SERVER when URL has a path', () => {
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com/argocd')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')

    const result = getEndpointDetails('myconn')

    expect(result).toBe('https://argocd.example.com/argocd/')
    expect(mockedTask.setVariable).toHaveBeenCalledWith('ARGOCD_SERVER', 'argocd.example.com/argocd')
  })
})

// ─── resolveVersion ──────────────────────────────────────────────────

describe('resolveVersion', () => {
  it("should resolve 'latest' by fetching GitHub releases", async () => {
    mockGetLatestVersion.mockResolvedValue('v2.10.0')

    const result = await resolveVersion('latest')

    expect(result).toBe('v2.10.0')
    expect(mockGetLatestVersion).toHaveBeenCalledWith('argoproj/argo-cd')
  })

  it("should resolve 'LATEST' case-insensitively", async () => {
    mockGetLatestVersion.mockResolvedValue('v2.10.0')

    const result = await resolveVersion('LATEST')

    expect(result).toBe('v2.10.0')
  })

  it("should resolve 'SERVER' case-insensitively", async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await resolveVersion('SERVER', 'https://argocd.example.com')

    expect(result).toBe('v2.9.3')
  })

  it("should throw when 'server' is requested without a server URL", async () => {
    await expect(resolveVersion('server')).rejects.toThrow('Server URL is required when version is server')
  })

  it("should resolve 'server' by fetching from ArgoCD server API", async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3+abc123' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await resolveVersion('server', 'https://argocd.example.com')

    expect(result).toBe('v2.9.3+abc123')
  })

  it('should return explicit version string as-is', async () => {
    const result = await resolveVersion('v1.5.0')

    expect(result).toBe('v1.5.0')
  })

  it('should return explicit version without prefix string as-is', async () => {
    const result = await resolveVersion('3.0.0')

    expect(result).toBe('3.0.0')
  })
})

// ─── getServerVersion ───────────────────────────────────────────────

describe('getServerVersion', () => {
  it('should return version without build metadata as-is', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await getServerVersion('https://argocd.example.com')

    expect(result).toBe('v2.9.3')
  })

  it('should return version with build metadata unchanged', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3+abc123' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await getServerVersion('https://argocd.example.com')

    expect(result).toBe('v2.9.3+abc123')
  })

  it('should throw when server response is not valid JSON', async () => {
    const mockResponse = {
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token < in JSON')),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    await expect(getServerVersion('https://argocd.example.com')).rejects.toThrow(
      'Failed to resolve version from server https://argocd.example.com',
    )
  })

  it('should throw when fetch fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network error'))

    await expect(getServerVersion('https://argocd.example.com')).rejects.toThrow(
      'Failed to resolve version from server https://argocd.example.com',
    )
  })

  it('should throw when version is missing from response', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({}),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    await expect(getServerVersion('https://argocd.example.com')).rejects.toThrow(
      'Failed to resolve version from server https://argocd.example.com',
    )
  })

  it('should preserve path prefix when building version URL', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3' }),
    } as unknown as Response
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    await getServerVersion('https://argocd.example.com/argocd/')

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://argocd.example.com/argocd/api/version' }),
    )
  })
})

// ─── run ─────────────────────────────────────────────────────────────

describe('run', () => {
  it('should install from GitHub and verify the tool', async () => {
    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v2.10.0'
      return undefined
    })
    mockedTool.findLocalTool.mockReturnValue('')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockInstallTool).toHaveBeenCalledWith('argocd', '2.10.0', expect.stringContaining('v2.10.0'), false)
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it("should default to 'latest' when no version input", async () => {
    mockedTask.getInput.mockImplementation(() => undefined)
    mockGetLatestVersion.mockResolvedValue('v2.14.0')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockGetLatestVersion).toHaveBeenCalledWith('argoproj/argo-cd')
    expect(mockInstallTool).toHaveBeenCalledWith('argocd', '2.14.0', expect.stringContaining('v2.14.0'), false)
  })

  it('should set ARGOCD_OPTS when options input is provided', async () => {
    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v2.10.0'
      if (name === 'options') return '--grpc-web'
      return undefined
    })
    mockedTool.findLocalTool.mockReturnValue('/cached/path')

    await run()

    expect(mockedTask.setVariable).toHaveBeenCalledWith('ARGOCD_OPTS', '--grpc-web')
  })

  it('should not set ARGOCD_OPTS when options input is not provided', async () => {
    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v2.10.0'
      return undefined
    })
    mockedTool.findLocalTool.mockReturnValue('/cached/path')

    await run()

    expect(mockedTask.setVariable).not.toHaveBeenCalledWith('ARGOCD_OPTS', expect.anything())
  })

  it('should fail when install fails with no fallback', async () => {
    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v2.10.0'
      return undefined
    })
    mockedTool.findLocalTool.mockReturnValue('')
    mockInstallTool.mockRejectedValue(new Error('download failed'))

    await run()

    expect(mockInstallTool).toHaveBeenCalledTimes(1)
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'download failed')
  })

  it('should strip build metadata from explicit version input', async () => {
    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v2.9.3+abc123'
      return undefined
    })
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockInstallTool).toHaveBeenCalledWith('argocd', '2.9.3', expect.stringContaining('v2.9.3'), false)
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should set env vars from service connection when version is not server', async () => {
    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v2.10.0'
      if (name === 'connection') return 'myconn'
      return undefined
    })
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockedTask.setVariable).toHaveBeenCalledWith('ARGOCD_SERVER', 'argocd.example.com')
    expect(mockedTask.setVariable).toHaveBeenCalledWith('ARGOCD_AUTH_TOKEN', 'token123')
    expect(mockInstallTool).toHaveBeenCalledWith('argocd', '2.10.0', expect.stringContaining('v2.10.0'), false)
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should fail when version is requested without service connection', async () => {
    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'server'
      return undefined
    })

    await run()

    expect(mockedTask.setResult).toHaveBeenCalledWith(
      task.TaskResult.Failed,
      'Service connection is required when version is set to server',
    )
  })

  it('should install from server download endpoint when version is server', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3+abc123' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'server'
      if (name === 'connection') return 'myconn'
      return undefined
    })
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')
    mockedTool.findLocalTool.mockReturnValue('')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockInstallTool).toHaveBeenCalledWith(
      'argocd',
      '2.9.3',
      'https://argocd.example.com/download/argocd-linux-amd64',
      false,
    )
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should fall back to GitHub when server download URL returns a non-2xx HTTP response', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3+abc123' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'server'
      if (name === 'connection') return 'myconn'
      return undefined
    })
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')
    mockedTool.findLocalTool.mockReturnValue('')

    const httpError = Object.assign(new Error('Unexpected HTTP response: 404'), { httpStatusCode: 404 })
    mockInstallTool.mockRejectedValueOnce(httpError).mockResolvedValueOnce(undefined)

    await run()

    expect(mockInstallTool).toHaveBeenNthCalledWith(
      1,
      'argocd',
      '2.9.3',
      'https://argocd.example.com/download/argocd-linux-amd64',
      false,
    )
    expect(mockInstallTool).toHaveBeenNthCalledWith(2, 'argocd', '2.9.3', expect.stringContaining('v2.9.3'), false)
    expect(mockedTask.warning).toHaveBeenCalledWith(expect.stringContaining('2.9.3'))
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should fail immediately when server install fails with a non-HTTP error', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3+abc123' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'server'
      if (name === 'connection') return 'myconn'
      return undefined
    })
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')
    mockedTool.findLocalTool.mockReturnValue('')
    mockInstallTool.mockRejectedValue(new Error('disk full'))

    await run()

    expect(mockInstallTool).toHaveBeenCalledTimes(1)
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'disk full')
  })

  it('should fail when server HTTP-error fallback to GitHub also fails', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3+abc123' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'server'
      if (name === 'connection') return 'myconn'
      return undefined
    })
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')
    mockedTool.findLocalTool.mockReturnValue('')

    const httpError = Object.assign(new Error('Unexpected HTTP response: 404'), { httpStatusCode: 404 })
    mockInstallTool.mockRejectedValueOnce(httpError).mockRejectedValueOnce(new Error('github also failed'))

    await run()

    expect(mockInstallTool).toHaveBeenCalledTimes(2)
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Failed, 'github also failed')
  })

  it('should preserve path prefix in server download URL', async () => {
    const mockResponse = {
      json: vi.fn().mockResolvedValue({ Version: 'v2.9.3' }),
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'server'
      if (name === 'connection') return 'myconn'
      return undefined
    })
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com/argocd')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')
    mockedTool.findLocalTool.mockReturnValue('')
    mockInstallTool.mockResolvedValue(undefined)

    await run()

    expect(mockInstallTool).toHaveBeenCalledWith(
      'argocd',
      '2.9.3',
      'https://argocd.example.com/argocd/download/argocd-linux-amd64',
      false,
    )
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should use Windows-specific binary name on Windows platform', async () => {
    // downloadFileName is computed at module load time, so a fresh import is needed
    const winInstallTool = vi.fn().mockResolvedValue(undefined)
    vi.resetModules()
    vi.doMock('@bonddim/utils', () => ({
      getLatestVersion: vi.fn(),
      installTool: winInstallTool,
      isWindows: vi.fn().mockReturnValue(true),
      isHttpError: (error: unknown) => error instanceof Error && 'httpStatusCode' in error,
    }))

    const { run: winRun } = await import('../src/run')

    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'v2.10.0'
      return undefined
    })

    await winRun()

    expect(winInstallTool).toHaveBeenCalledWith(
      'argocd',
      '2.10.0',
      expect.stringContaining('argocd-windows-amd64.exe'),
      false,
    )
    expect(mockedTask.setResult).toHaveBeenCalledWith(task.TaskResult.Succeeded, '')
  })

  it('should fail fast when server version resolution fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connection refused'))

    mockedTask.getInput.mockImplementation((name: string) => {
      if (name === 'version') return 'server'
      if (name === 'connection') return 'myconn'
      return undefined
    })
    mockedTask.getEndpointUrlRequired.mockReturnValue('https://argocd.example.com')
    mockedTask.getEndpointAuthorizationParameterRequired.mockReturnValue('token123')

    await run()

    expect(mockInstallTool).not.toHaveBeenCalled()
    expect(mockedTask.setResult).toHaveBeenCalledWith(
      task.TaskResult.Failed,
      'Failed to resolve version from server https://argocd.example.com/',
    )
  })
})
