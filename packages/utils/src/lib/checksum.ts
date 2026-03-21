import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import { debug } from 'azure-pipelines-task-lib/task'
import * as toolLib from 'azure-pipelines-tool-lib/tool'

/**
 * Download and parse a checksum file from a URL
 * Expects standard format: `hash  filename` or `hash *filename` per line
 * @param url URL of the checksum file to download
 * @returns Map of filename to hash string
 */
export async function downloadChecksumFile(url: string): Promise<Map<string, string>> {
  debug(`Downloading checksum file from ${url}`)
  const filePath = await toolLib.downloadTool(url, undefined, undefined, {
    connection: 'close',
    'User-Agent': 'AzureDevOps',
  })

  const content = await fs.promises.readFile(filePath, 'utf-8')
  const checksums = new Map<string, string>()

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Match: hash<whitespace>filename or hash<whitespace>*filename
    const match = trimmed.match(/^([0-9a-fA-F]+)\s+\*?(.+)$/)
    if (match) {
      checksums.set(match[2]!.trim(), match[1]!.toLowerCase())
    }
  }

  return checksums
}

/**
 * Validate a file's SHA256 checksum against an expected hash
 * @param filePath path to the file to validate
 * @param expectedHash expected SHA256 hex digest
 * @throws if the checksum does not match
 */
export async function validateChecksum(filePath: string, expectedHash: string): Promise<void> {
  debug(`Validating checksum of ${filePath}`)
  const hash = crypto.createHash('sha256')
  const stream = fs.createReadStream(filePath)

  for await (const chunk of stream) {
    hash.update(chunk)
  }

  const actualHash = hash.digest('hex')
  if (actualHash !== expectedHash.toLowerCase()) {
    throw new Error(`Checksum mismatch: expected ${expectedHash}, got ${actualHash}`)
  }

  debug('Checksum validation passed')
}
