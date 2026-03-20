const { globSync } = require('glob')
const { readFileSync, writeFileSync, rmSync } = require('node:fs')
const { dirname, basename } = require('node:path')

const repository = 'https://github.com/bonddim/azure-devops-extensions'

/**
 * Removes any existing .vsix files in the extension directory to ensure a clean slate for the new version.
 */
function rmPrevious() {
  const vsixFiles = globSync('*.vsix')
  vsixFiles.forEach((vsixFile) => {
    console.log(`Removing existing VSIX file: ${vsixFile}`)
    rmSync(vsixFile, { force: true })
  })
}

/**
 *  Update patch version in all task.json with the version from the environment variable.
 *  Tasks major version is immutable, minor is incremented manually.
 * @param {*} taskJsonPaths - array of paths to task.json files
 * @param {*} patchVersion - patch version to set in task.json files
 */
function patchTaskVersions(taskJsonPaths, patchVersion) {
  for (const taskJsonPath of taskJsonPaths) {
    const task = JSON.parse(readFileSync(taskJsonPath, 'utf-8'))

    task.version.Patch = patchVersion
    writeFileSync(taskJsonPath, JSON.stringify(task, null, 2))
  }
}

/**
 * Builds the contributions array for the extension manifest by reading each task.json file, extracting the task name and directory,
 * and creating a contribution object for each task.
 * @param {*} taskJsonPaths - array of paths to task.json files
 * @returns array of contribution objects to be included in the extension manifest
 */
function buildContributions(taskJsonPaths) {
  return taskJsonPaths.map((taskJsonPath) => {
    const taskDir = dirname(taskJsonPath)
    return {
      id: basename(taskDir),
      type: 'ms.vss-distributed-task.task',
      targets: ['ms.vss-distributed-task.tasks'],
      properties: { name: taskDir },
    }
  })
}

// Main export function that generates the extension manifest object
function buildManifest() {
  rmPrevious()

  const taskJsonPaths = globSync('tasks/*/task.json')
  const taskFiles = globSync('tasks/*/{task.json,icon.png,dist/index.js}')

  // Update patch version in task.json files if environment variable is set
  if (process.env.GITHUB_RUN_NUMBER) {
    console.log('Patching task versions with GITHUB_RUN_NUMBER:', process.env.GITHUB_RUN_NUMBER)
    patchTaskVersions(taskJsonPaths, Number.parseInt(process.env.GITHUB_RUN_NUMBER, 10))
  }

  return {
    manifestVersion: 1,
    public: false,
    publisher: 'bonddim',
    categories: ['Azure Pipelines'],
    icons: { default: 'icon.png' },
    galleryFlags: ['Preview'],
    content: {
      changelog: { path: 'CHANGELOG.md' },
      details: { path: 'README.md' },
    },
    links: {
      support: { uri: `${repository}/issues` },
    },
    repository: { type: 'git', uri: repository },
    targets: [{ id: 'Microsoft.VisualStudio.Services' }],
    contributions: buildContributions(taskJsonPaths),
    files: [
      // Include license and privacy files from repository root
      {
        addressable: true,
        assetType: 'Microsoft.VisualStudio.Services.Content.License',
        packagePath: 'LICENSE',
        path: '../../LICENSE',
      },
      {
        addressable: true,
        assetType: 'Microsoft.VisualStudio.Services.Content.Privacypolicy',
        packagePath: 'PRIVACY.md',
        path: '../../PRIVACY.md',
      },
      // Dynamically include task-related files (task.json, icon.png, dist/index.js) for each task
      ...taskFiles.map((file) => ({ path: file })),
    ],
  }
}

module.exports = buildManifest
