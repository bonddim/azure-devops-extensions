const buildManifest = require('../../tools/build-manifest')
const { version } = require('./package.json')

const base = buildManifest()

function manifest() {
  return {
    ...base,
    id: 'terramate-devops-extension',
    public: true,
    name: 'Terramate',
    description: 'Terramate extension for Azure DevOps',
    tags: ['terramate', 'terraform', 'iac', 'devops'],
    version,
    contributions: [
      {
        id: 'terramate-installer-task',
        type: 'ms.vss-distributed-task.task',
        targets: ['ms.vss-distributed-task.tasks'],
        properties: {
          name: 'tasks/TerramateInstaller',
        },
      },
    ],
  }
}
console.log('Final manifest:\n', JSON.stringify(manifest(), null, 2))

module.exports = manifest
