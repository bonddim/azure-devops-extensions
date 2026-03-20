import * as fs from 'node:fs'
import * as os from 'node:os'
import * as toolLib from 'azure-pipelines-tool-lib/tool'
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('node:os')
vi.mock('azure-pipelines-tool-lib/tool', () => ({
  findLocalTool: vi.fn(),
  downloadTool: vi.fn(),
  extractZip: vi.fn(),
  extract7z: vi.fn(),
  extractTar: vi.fn(),
  cacheDir: vi.fn(),
  cacheFile: vi.fn(),
  prependPath: vi.fn(),
}))

// Import under test AFTER vi.mock calls (vitest hoists them, but this clarifies intent)
const { installTool, isHttpError } = await import('../src/lib/install')

describe('installTool', () => {
  describe('when tool is already cached', () => {
    it('prepends the cached path without downloading', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue('/cached/mytool')

      await installTool('mytool', '1.0.0', 'https://example.com/mytool', false)

      expect(toolLib.downloadTool).not.toHaveBeenCalled()
      expect(toolLib.prependPath).toHaveBeenCalledWith('/cached/mytool')
    })
  })

  describe('when tool is not cached', () => {
    it('downloads and installs binary on Linux with chmod', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/mytool')
      vi.mocked(os.platform).mockReturnValue('linux')
      vi.mocked(fs.promises.chmod).mockResolvedValue(undefined)
      vi.mocked(toolLib.cacheFile).mockResolvedValue('/cached/mytool')

      await installTool('mytool', '1.0.0', 'https://example.com/mytool', false)

      expect(toolLib.downloadTool).toHaveBeenCalledWith('https://example.com/mytool', undefined, undefined, {
        'User-Agent': 'AzureDevOps',
        connection: 'close',
      })
      expect(fs.promises.chmod).toHaveBeenCalledWith('/tmp/mytool', 0o755)
      expect(toolLib.cacheFile).toHaveBeenCalledWith('/tmp/mytool', 'mytool', 'mytool', '1.0.0')
      expect(toolLib.prependPath).toHaveBeenCalledWith('/cached/mytool')
    })

    it('downloads and installs binary on Windows with .exe suffix, no chmod', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/mytool')
      vi.mocked(os.platform).mockReturnValue('win32')
      vi.mocked(toolLib.cacheFile).mockResolvedValue('/cached/mytool.exe')

      await installTool('mytool', '1.0.0', 'https://example.com/mytool', false)

      expect(fs.promises.chmod).not.toHaveBeenCalled()
      expect(toolLib.cacheFile).toHaveBeenCalledWith('/tmp/mytool', 'mytool.exe', 'mytool', '1.0.0')
      expect(toolLib.prependPath).toHaveBeenCalledWith('/cached/mytool.exe')
    })

    it('extracts a .zip archive', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/mytool.zip')
      vi.mocked(toolLib.extractZip).mockResolvedValue('/tmp/extracted')
      vi.mocked(toolLib.cacheDir).mockResolvedValue('/cached/mytool')

      await installTool('mytool', '1.0.0', 'https://example.com/mytool.zip', true)

      expect(toolLib.extractZip).toHaveBeenCalledWith('/tmp/mytool.zip')
      expect(toolLib.extract7z).not.toHaveBeenCalled()
      expect(toolLib.extractTar).not.toHaveBeenCalled()
      expect(toolLib.cacheDir).toHaveBeenCalledWith('/tmp/extracted', 'mytool', '1.0.0')
      expect(toolLib.prependPath).toHaveBeenCalledWith('/cached/mytool')
    })

    it('extracts a .7z archive', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/mytool.7z')
      vi.mocked(toolLib.extract7z).mockResolvedValue('/tmp/extracted')
      vi.mocked(toolLib.cacheDir).mockResolvedValue('/cached/mytool')

      await installTool('mytool', '1.0.0', 'https://example.com/mytool.7z', true)

      expect(toolLib.extract7z).toHaveBeenCalledWith('/tmp/mytool.7z')
      expect(toolLib.extractZip).not.toHaveBeenCalled()
      expect(toolLib.extractTar).not.toHaveBeenCalled()
      expect(toolLib.cacheDir).toHaveBeenCalledWith('/tmp/extracted', 'mytool', '1.0.0')
      expect(toolLib.prependPath).toHaveBeenCalledWith('/cached/mytool')
    })

    it('falls back to tar extractor for .tar.gz archives', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/mytool.tar.gz')
      vi.mocked(toolLib.extractTar).mockResolvedValue('/tmp/extracted')
      vi.mocked(toolLib.cacheDir).mockResolvedValue('/cached/mytool')

      await installTool('mytool', '1.0.0', 'https://example.com/mytool.tar.gz', true)

      expect(toolLib.extractTar).toHaveBeenCalledWith('/tmp/mytool.tar.gz')
      expect(toolLib.extractZip).not.toHaveBeenCalled()
      expect(toolLib.extract7z).not.toHaveBeenCalled()
      expect(toolLib.cacheDir).toHaveBeenCalledWith('/tmp/extracted', 'mytool', '1.0.0')
      expect(toolLib.prependPath).toHaveBeenCalledWith('/cached/mytool')
    })

    it('falls back to tar extractor for unrecognized extensions', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/mytool.bin')
      vi.mocked(toolLib.extractTar).mockResolvedValue('/tmp/extracted')
      vi.mocked(toolLib.cacheDir).mockResolvedValue('/cached/mytool')

      await installTool('mytool', '1.0.0', 'https://example.com/mytool.bin', true)

      expect(toolLib.extractTar).toHaveBeenCalledWith('/tmp/mytool.bin')
    })

    it('detects archive extension case-insensitively from the URL', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/mytool.ZIP')
      vi.mocked(toolLib.extractZip).mockResolvedValue('/tmp/extracted')
      vi.mocked(toolLib.cacheDir).mockResolvedValue('/cached/mytool')

      await installTool('mytool', '1.0.0', 'https://example.com/mytool.ZIP', true)

      expect(toolLib.extractZip).toHaveBeenCalled()
    })
  })

  describe('error handling', () => {
    it('re-throws HTTP errors from downloadTool directly without wrapping', async () => {
      const httpError = Object.assign(new Error('Unexpected HTTP response: 404'), { httpStatusCode: 404 })
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockRejectedValue(httpError)

      const error = await installTool('mytool', '1.0.0', 'https://example.com/mytool', false).catch((e) => e)

      expect(error).toBe(httpError)
      expect(error.httpStatusCode).toBe(404)
    })

    it('re-throws HTTP server errors from downloadTool directly without wrapping', async () => {
      const httpError = Object.assign(new Error('Unexpected HTTP response: 503'), { httpStatusCode: 503 })
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockRejectedValue(httpError)

      const error = await installTool('mytool', '1.0.0', 'https://example.com/mytool', false).catch((e) => e)

      expect(error).toBe(httpError)
      expect(error.httpStatusCode).toBe(503)
    })

    it('throws a descriptive error when download fails with an Error instance', async () => {
      const cause = new Error('network timeout')
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockRejectedValue(cause)
      vi.mocked(os.platform).mockReturnValue('linux')

      const error = await installTool('mytool', '1.0.0', 'https://example.com/mytool', false).catch((e) => e)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Failed to install tool mytool version 1.0.0 from https://example.com/mytool')
      expect(error.cause).toBe(cause)
    })

    it('throws a descriptive error when download fails with a non-Error value', async () => {
      vi.mocked(toolLib.findLocalTool).mockReturnValue(undefined as unknown as string)
      vi.mocked(toolLib.downloadTool).mockRejectedValue('connection refused')
      vi.mocked(os.platform).mockReturnValue('linux')

      const error = await installTool('mytool', '1.0.0', 'https://example.com/mytool', false).catch((e) => e)

      expect(error).toBeInstanceOf(Error)
      expect(error.message).toBe('Failed to install tool mytool version 1.0.0 from https://example.com/mytool')
      expect(error.cause).toBe('connection refused')
    })
  })
})

describe('isHttpError', () => {
  it('returns true for errors with httpStatusCode', () => {
    const error = Object.assign(new Error('Unexpected HTTP response: 404'), { httpStatusCode: 404 })
    expect(isHttpError(error)).toBe(true)
  })

  it('returns false for plain errors without httpStatusCode', () => {
    expect(isHttpError(new Error('network timeout'))).toBe(false)
  })

  it('returns false for non-Error values', () => {
    expect(isHttpError('string error')).toBe(false)
    expect(isHttpError(null)).toBe(false)
  })
})
