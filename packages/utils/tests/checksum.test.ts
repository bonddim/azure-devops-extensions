import * as fs from 'node:fs'
import * as toolLib from 'azure-pipelines-tool-lib/tool'
import { describe, expect, it, vi } from 'vitest'

vi.mock('node:fs')
vi.mock('azure-pipelines-task-lib/task')
vi.mock('azure-pipelines-tool-lib/tool', () => ({
  downloadTool: vi.fn(),
}))

const { downloadChecksumFile, validateChecksum } = await import('../src/lib/checksum')

describe('downloadChecksumFile', () => {
  it('parses standard checksum format with double-space separator', async () => {
    vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/checksums')
    vi.mocked(fs.promises.readFile).mockResolvedValue(
      'abc123  mytool-linux-amd64.tar.gz\ndef456  mytool-darwin-amd64.tar.gz\n',
    )

    const result = await downloadChecksumFile('https://example.com/checksums')

    expect(result.get('mytool-linux-amd64.tar.gz')).toBe('abc123')
    expect(result.get('mytool-darwin-amd64.tar.gz')).toBe('def456')
    expect(result.size).toBe(2)
  })

  it('parses checksum format with asterisk prefix on filename', async () => {
    vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/checksums')
    vi.mocked(fs.promises.readFile).mockResolvedValue('abc123 *mytool-linux-amd64.tar.gz\n')

    const result = await downloadChecksumFile('https://example.com/checksums')

    expect(result.get('mytool-linux-amd64.tar.gz')).toBe('abc123')
  })

  it('normalizes hash to lowercase', async () => {
    vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/checksums')
    vi.mocked(fs.promises.readFile).mockResolvedValue('ABC123DEF  mytool.tar.gz\n')

    const result = await downloadChecksumFile('https://example.com/checksums')

    expect(result.get('mytool.tar.gz')).toBe('abc123def')
  })

  it('skips empty lines', async () => {
    vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/checksums')
    vi.mocked(fs.promises.readFile).mockResolvedValue('\nabc123  mytool.tar.gz\n\n')

    const result = await downloadChecksumFile('https://example.com/checksums')

    expect(result.size).toBe(1)
  })

  it('downloads checksum file with correct headers', async () => {
    vi.mocked(toolLib.downloadTool).mockResolvedValue('/tmp/checksums')
    vi.mocked(fs.promises.readFile).mockResolvedValue('')

    await downloadChecksumFile('https://example.com/checksums')

    expect(toolLib.downloadTool).toHaveBeenCalledWith('https://example.com/checksums', undefined, undefined, {
      connection: 'close',
      'User-Agent': 'AzureDevOps',
    })
  })
})

describe('validateChecksum', () => {
  it('passes when checksum matches', async () => {
    // Create a mock readable stream that emits known content
    const { Readable } = await import('node:stream')
    const mockStream = Readable.from([Buffer.from('hello')])
    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as fs.ReadStream)

    // SHA256 of "hello" = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    await expect(
      validateChecksum('/tmp/file', '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'),
    ).resolves.toBeUndefined()
  })

  it('throws on checksum mismatch', async () => {
    const { Readable } = await import('node:stream')
    const mockStream = Readable.from([Buffer.from('hello')])
    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as fs.ReadStream)

    await expect(validateChecksum('/tmp/file', 'deadbeef')).rejects.toThrow('Checksum mismatch')
  })

  it('handles case-insensitive expected hash', async () => {
    const { Readable } = await import('node:stream')
    const mockStream = Readable.from([Buffer.from('hello')])
    vi.spyOn(fs, 'createReadStream').mockReturnValue(mockStream as fs.ReadStream)

    await expect(
      validateChecksum('/tmp/file', '2CF24DBA5FB0A30E26E83B2AC5B9E29E1B161E5C1FA7425E73043362938B9824'),
    ).resolves.toBeUndefined()
  })
})
