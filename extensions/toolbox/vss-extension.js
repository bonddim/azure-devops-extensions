const buildManifest = require('../../tools/build-manifest')
const { version } = require('./package.json')

const base = buildManifest()

function manifest() {
  return {
    ...base,
    id: 'toolbox',
    public: true,
    name: 'Toolbox',
    description: 'Azure Pipelines Toolbox',
    tags: ['tools', 'installer'],
    version,
  }
}
console.log('Final manifest:\n', JSON.stringify(manifest(), null, 2))

module.exports = manifest
