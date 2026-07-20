import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

const projectDirectory = process.cwd()
const electronExecutable = require('electron') as string

async function launchWorkspace(userDataDirectory: string) {
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: ['.'],
    cwd: projectDirectory,
    env: { ...process.env, OMNIDESIGN_USER_DATA_DIR: userDataDirectory },
  })
  return { app, window: await app.firstWindow() }
}

test('creates and recovers a standalone design in the built Electron app', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-e2e-'))
  try {
    const firstRun = await launchWorkspace(userDataDirectory)
    await expect(firstRun.window.getByRole('heading', { name: 'Start with an idea.' })).toBeVisible()
    const prompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A calm analytics dashboard')
    await prompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await expect(firstRun.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()
    const exportPath = path.join(userDataDirectory, 'offline-design.zip')
    await firstRun.app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: destination })
    }, exportPath)
    await firstRun.window.getByRole('button', { name: 'Export' }).click()
    await expect.poll(async () => {
      try {
        return (await stat(exportPath)).size > 0
      } catch {
        return false
      }
    }).toBe(true)
    await firstRun.app.close()

    const secondRun = await launchWorkspace(userDataDirectory)
    await expect(secondRun.window.getByText('A calm analytics dashboard')).toBeVisible()
    await secondRun.window.getByText('A calm analytics dashboard').click()
    await expect(secondRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await secondRun.app.close()
  } finally {
    await rm(userDataDirectory, { recursive: true, force: true })
  }
})
