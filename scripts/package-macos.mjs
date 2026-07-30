import { spawn } from 'node:child_process'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const packageCommands = new Set(['package:mac:arm64', 'package:mac:x64'])
const credentialMappings = [
  ['OMNIDESIGN_MAC_CSC_LINK', 'CSC_LINK'],
  ['OMNIDESIGN_MAC_CSC_KEY_PASSWORD', 'CSC_KEY_PASSWORD'],
  ['OMNIDESIGN_APPLE_ID', 'APPLE_ID'],
  ['OMNIDESIGN_APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_APP_SPECIFIC_PASSWORD'],
  ['OMNIDESIGN_APPLE_TEAM_ID', 'APPLE_TEAM_ID'],
]

function hasValue(value) {
  return typeof value === 'string' && value.length > 0
}

export function prepareMacPackagingEnvironment(sourceEnvironment) {
  const environment = { ...sourceEnvironment }
  const providedCredentials = credentialMappings.filter(([sourceName]) => hasValue(sourceEnvironment[sourceName]))

  for (const [sourceName, targetName] of credentialMappings) {
    delete environment[sourceName]
    delete environment[targetName]
  }

  if (providedCredentials.length === 0) {
    environment.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    return { environment, signed: false }
  }

  if (providedCredentials.length !== credentialMappings.length) {
    const missingNames = credentialMappings
      .filter(([sourceName]) => !hasValue(sourceEnvironment[sourceName]))
      .map(([sourceName]) => sourceName)
    throw new Error(`Incomplete macOS signing and notarization credentials. Missing: ${missingNames.join(', ')}`)
  }

  delete environment.CSC_IDENTITY_AUTO_DISCOVERY
  for (const [sourceName, targetName] of credentialMappings) {
    environment[targetName] = sourceEnvironment[sourceName]
  }
  return { environment, signed: true }
}

export async function runMacPackaging(command, sourceEnvironment = process.env) {
  if (!packageCommands.has(command)) {
    throw new Error(`Unsupported macOS package command: ${command || '<missing>'}`)
  }

  const { environment, signed } = prepareMacPackagingEnvironment(sourceEnvironment)
  console.log(`Packaging ${signed ? 'signed and notarized' : 'unsigned'} macOS artifacts.`)

  const child = spawn('pnpm', ['run', command], {
    env: environment,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(signal ? `macOS packaging stopped by ${signal}` : `macOS packaging exited with code ${code}`))
      }
    })
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runMacPackaging(process.argv[2]).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
