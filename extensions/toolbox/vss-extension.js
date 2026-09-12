const buildManifest = require('../../tools/build-manifest')
const { version } = require('./package.json')

const base = buildManifest()

function manifest() {
  return {
    ...base,
    id: '853934ee-2696-11f1-b8e6-00155d89217a',
    public: true,
    name: 'Toolbox',
    description: 'Azure Pipelines Toolbox',
    tags: ['tools', 'installer'],
    version,
  }
}
console.log('Final manifest:\n', JSON.stringify(manifest(), null, 2))

module.exports = manifest
