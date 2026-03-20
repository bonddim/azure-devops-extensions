const buildManifest = require('../../tools/build-manifest')
const { version } = require('./package.json')

const base = buildManifest()

function manifest() {
  return {
    ...base,
    id: 'argocd-installer',
    public: true,
    name: 'Argo CD CLI Extension',
    description: 'Argo CD CLI Extension for Azure DevOps',
    tags: ['argocd', 'argo cd', 'gitops', 'devops'],
    version,
    contributions: [
      ...base.contributions,
      {
        id: 'service-endpoint',
        type: 'ms.vss-endpoint.service-endpoint-type',
        targets: ['ms.vss-endpoint.endpoint-types'],
        properties: {
          name: 'ArgoCDServer',
          displayName: 'Argo CD Server',
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
