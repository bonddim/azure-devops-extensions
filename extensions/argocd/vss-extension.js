const buildManifest = require('../../tools/build-manifest')
const { version } = require('./package.json')

const base = buildManifest()

function manifest() {
  return {
    ...base,
    id: 'argocd-installer-test',
    public: true,
    name: 'Argo CD CLI Installer TEST',
    description: 'Argo CD CLI Installer Task for Azure DevOps',
    version,
    contributions: [
      ...base.contributions,
      {
        id: '91625250-22db-11f1-93a5-00155df413f0',
        type: 'ms.vss-endpoint.service-endpoint-type',
        targets: ['ms.vss-endpoint.endpoint-types'],
        properties: {
          name: '35ca8d64-1eed-11f1-8fe5-00155d25990c',
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
