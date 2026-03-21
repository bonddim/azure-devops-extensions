const buildManifest = require('../../tools/build-manifest')
const { version } = require('./package.json')

const base = buildManifest()

function manifest() {
  return {
    ...base,
    id: 'toolbox-devops-extension',
    public: true,
    name: 'Toolbox',
    description: 'Install any tool from GitHub releases on Azure DevOps agents',
    tags: ['github', 'tools', 'installer'],
    version,
    contributions: [
      {
        id: 'github-tool-installer-task',
        type: 'ms.vss-distributed-task.task',
        targets: ['ms.vss-distributed-task.tasks'],
        properties: {
          name: 'tasks/GitHubToolInstaller',
        },
      },
    ],
  }
}
console.log('Final manifest:\n', JSON.stringify(manifest(), null, 2))

module.exports = manifest
