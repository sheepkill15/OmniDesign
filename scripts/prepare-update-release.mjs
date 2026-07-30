import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parse, stringify } from 'yaml'

const artifactNames = [
  'omnidesign-windows-x64',
  'omnidesign-macos-arm64',
  'omnidesign-macos-x64',
]

async function readMetadata(filePath) {
  const value = parse(await readFile(filePath, 'utf8'))
  if (!value || typeof value !== 'object' || typeof value.version !== 'string' || !Array.isArray(value.files)) {
    throw new Error(`Invalid update metadata: ${filePath}`)
  }
  return value
}

function selectMacZip(metadata, architecture) {
  const match = metadata.files.find((file) => {
    if (!file || typeof file.url !== 'string' || !file.url.endsWith('.zip')) return false
    return architecture === 'arm64' ? file.url.includes('arm64') : file.url.includes('x64')
  })
  if (!match) throw new Error(`Missing ${architecture} macOS update ZIP in metadata.`)
  return match
}

async function copyArtifactFiles(sourceDirectory, outputDirectory, copiedNames) {
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name === 'latest-mac.yml') continue
    if (copiedNames.has(entry.name)) throw new Error(`Duplicate release asset: ${entry.name}`)
    copiedNames.add(entry.name)
    await copyFile(path.join(sourceDirectory, entry.name), path.join(outputDirectory, entry.name))
  }
}

export async function prepareUpdateRelease(artifactRoot, outputDirectory) {
  const directories = Object.fromEntries(artifactNames.map((name) => [name, path.join(artifactRoot, name)]))
  const windowsMetadata = await readMetadata(path.join(directories['omnidesign-windows-x64'], 'latest.yml'))
  const armMetadata = await readMetadata(path.join(directories['omnidesign-macos-arm64'], 'latest-mac.yml'))
  const x64Metadata = await readMetadata(path.join(directories['omnidesign-macos-x64'], 'latest-mac.yml'))
  const versions = new Set([windowsMetadata.version, armMetadata.version, x64Metadata.version])
  if (versions.size !== 1) throw new Error(`Update artifacts disagree on version: ${[...versions].join(', ')}`)

  const armZip = selectMacZip(armMetadata, 'arm64')
  const x64Zip = selectMacZip(x64Metadata, 'x64')
  const mergedMacMetadata = {
    ...x64Metadata,
    files: [x64Zip, armZip],
    path: x64Zip.url,
    sha512: x64Zip.sha512,
  }

  await mkdir(outputDirectory, { recursive: true })
  const copiedNames = new Set()
  for (const artifactName of artifactNames) {
    await copyArtifactFiles(directories[artifactName], outputDirectory, copiedNames)
  }
  await writeFile(path.join(outputDirectory, 'latest-mac.yml'), stringify(mergedMacMetadata), 'utf8')

  return { version: windowsMetadata.version, files: [...copiedNames, 'latest-mac.yml'].sort() }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [artifactRoot, outputDirectory] = process.argv.slice(2)
  if (!artifactRoot || !outputDirectory) {
    console.error('Usage: node scripts/prepare-update-release.mjs <artifact-root> <output-directory>')
    process.exitCode = 1
  } else {
    prepareUpdateRelease(path.resolve(artifactRoot), path.resolve(outputDirectory)).then(({ version, files }) => {
      console.log(`Prepared OmniDesign ${version} with ${files.length} release assets.`)
    }).catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
  }
}
