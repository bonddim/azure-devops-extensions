import { describe, expect, it, vi } from 'vitest'
import { getLatestVersion } from '../src/index'

describe('getLatestVersion', () => {
  it('should extract version from redirect location header', async () => {
    const mockResponse = {
      headers: { get: vi.fn().mockReturnValue('https://github.com/owner/repository/releases/tag/v2.10.0') },
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await getLatestVersion('owner/repository')

    expect(result).toBe('v2.10.0')
  })

  it('should return empty string when location header is null', async () => {
    const mockResponse = {
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await getLatestVersion('owner/repository')

    expect(result).toBe('')
  })

  it('should return empty string when location header ends with empty segment', async () => {
    const mockResponse = {
      headers: { get: vi.fn().mockReturnValue('https://github.com/owner/repository/releases/tag/') },
    } as unknown as Response
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    const result = await getLatestVersion('owner/repository')

    expect(result).toBe('')
  })

  it('should call fetch with redirect manual and HEAD method', async () => {
    const mockResponse = {
      headers: { get: vi.fn().mockReturnValue('https://github.com/owner/repository/releases/tag/v1.0.0') },
    } as unknown as Response
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

    await getLatestVersion('owner/repository')

    expect(fetchSpy).toHaveBeenCalledOnce()
    const request = fetchSpy.mock.calls[0][0] as Request
    expect(request.url).toBe('https://github.com/owner/repository/releases/latest')
    expect(request.method).toBe('HEAD')
    expect(request.redirect).toBe('manual')
  })
})
