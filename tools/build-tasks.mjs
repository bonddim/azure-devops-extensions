// build.mjs (root)
import { build } from 'esbuild'
import { glob } from 'glob'

const entryPoints = await glob('tasks/*/src/index.ts')

await Promise.all(
  entryPoints.map((entry) =>
    build({
      entryPoints: [entry],
      bundle: true,
      logLevel: 'info',
      platform: 'node',
      target: 'node20',
      outfile: entry.replace('/src/index.ts', '/dist/index.js'),
    }),
  ),
)
