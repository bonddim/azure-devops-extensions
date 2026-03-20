import { run } from './run'

run().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
