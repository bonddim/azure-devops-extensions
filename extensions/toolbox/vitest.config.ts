import { mergeConfig } from 'vitest/config'
import shared from '../../vitest.shared'

export default mergeConfig(shared, {
  resolve: {
    alias: {
      '@bonddim/utils': new URL('../../packages/utils/src/index.ts', import.meta.url).pathname,
    },
  },
})
