import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parse, stringify } from 'yaml'
import { prepareUpdateRelease } from './prepare-update-release.mjs'

const temporaryDirectories = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })))
})

async function createArtifacts(versions = { windows: '0.0.8', arm64: '0.0.8', x64: '0.0.8' }) {
  const root = await mkdtemp(path.join(tmpdir(), 'omnidesign-release-'))
  temporaryDirectories.push(root)
  const output = path.join(root, 'prepared')
  const directories = {
    windows: path.join(root, 'omnidesign-windows-x64'),
    arm64: path.join(root, 'omnidesign-macos-arm64'),
    x64: path.join(root, 'omnidesign-macos-x64'),
  }
  await Promise.all(Object.values(directories).map((directory) => mkdir(directory)))
  await writeFile(path.join(directories.windows, 'OmniDesign.exe'), 'windows')
  await writeFile(path.join(directories.windows, 'latest.yml'), stringify({ version: versions.windows, files: [{ url: 'OmniDesign.exe', sha512: 'win' }], path: 'OmniDesign.exe', sha512: 'win' }))
  await writeFile(path.join(directories.arm64, 'OmniDesign-arm64-mac.zip'), 'arm')
  await writeFile(path.join(directories.arm64, 'latest-mac.yml'), stringify({ version: versions.arm64, files: [{ url: 'OmniDesign-arm64-mac.zip', sha512: 'arm' }], path: 'OmniDesign-arm64-mac.zip', sha512: 'arm' }))
  await writeFile(path.join(directories.x64, 'OmniDesign-x64-mac.zip'), 'x64')
  await writeFile(path.join(directories.x64, 'latest-mac.yml'), stringify({ version: versions.x64, files: [{ url: 'OmniDesign-x64-mac.zip', sha512: 'x64' }], path: 'OmniDesign-x64-mac.zip', sha512: 'x64' }))
  return { root, output }
}

describe('prepareUpdateRelease', () => {
  it('forwards the downloaded and prepared directories from the publish workflow', async () => {
    const workflow = parse(await readFile(path.resolve('.github/workflows/cd.yml'), 'utf8'))
    const prepareStep = workflow.jobs.release.steps.find((step) => step.name === 'Prepare architecture-aware update metadata')

    expect(prepareStep.run).toBe('pnpm release:prepare downloaded-artifacts release-assets')
  })

  it('combines native macOS metadata and preserves every release payload', async () => {
    const { root, output } = await createArtifacts()
    const result = await prepareUpdateRelease(root, output)
    const macMetadata = parse(await readFile(path.join(output, 'latest-mac.yml'), 'utf8'))

    expect(result.version).toBe('0.0.8')
    expect(result.files).toEqual(expect.arrayContaining(['OmniDesign.exe', 'latest.yml', 'OmniDesign-arm64-mac.zip', 'OmniDesign-x64-mac.zip', 'latest-mac.yml']))
    expect(macMetadata.files.map((file) => file.url)).toEqual(['OmniDesign-x64-mac.zip', 'OmniDesign-arm64-mac.zip'])
    expect(macMetadata.path).toBe('OmniDesign-x64-mac.zip')
  })

  it('rejects a release assembled from mismatched workflow versions', async () => {
    const { root, output } = await createArtifacts({ windows: '0.0.8', arm64: '0.0.9', x64: '0.0.8' })
    await expect(prepareUpdateRelease(root, output)).rejects.toThrow(/disagree on version/)
  })
})
