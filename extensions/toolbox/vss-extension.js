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
    contributions: [
      ...base.contributions,
      {
        id: 'argocd-service-endpoint',
        type: 'ms.vss-endpoint.service-endpoint-type',
        targets: ['ms.vss-endpoint.endpoint-types'],
        properties: {
          name: 'ArgoCDServerConnection',
          displayName: 'Argo CD Server (Toolbox)',
          url: {
            displayName: 'Argo CD Server URL',
            helpText: 'URL for the Argo CD Server to connect to.',
          },
          authenticationSchemes: [{ type: 'ms.vss-endpoint.endpoint-auth-scheme-token' }],
        },
      },
    ],
  }
}
console.log('Final manifest:\n', JSON.stringify(manifest(), null, 2))

module.exports = manifest
