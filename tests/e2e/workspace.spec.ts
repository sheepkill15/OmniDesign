import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication } from 'playwright'
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
  let activeApp: ElectronApplication | null = null
  try {
    const firstRun = await launchWorkspace(userDataDirectory)
    activeApp = firstRun.app
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
    activeApp = null

    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    const recoveredDesign = secondRun.window
      .getByRole('region', { name: 'Continue designing' })
      .getByRole('button')
      .filter({ hasText: 'A calm analytics dashboard' })
    await expect(recoveredDesign).toBeVisible()
    await recoveredDesign.click()
    await expect(secondRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await secondRun.app.close()
    activeApp = null
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('keeps a removed standalone design recoverable across an Electron restart', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-trash-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const firstRun = await launchWorkspace(userDataDirectory)
    activeApp = firstRun.app
    const pageErrors: string[] = []
    firstRun.window.on('pageerror', (error) => pageErrors.push(error.message))
    const prompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A disposable landing page')
    await prompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await firstRun.window.getByRole('button', { name: 'Remove' }).click()
    await firstRun.window.getByRole('button', { name: 'Trash' }).click()
    await expect(firstRun.window.getByText('A disposable landing page', { exact: true })).toBeVisible()
    await firstRun.window.waitForTimeout(200)
    expect(pageErrors).toEqual([])
    await firstRun.app.close()
    activeApp = null

    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    await secondRun.window.getByRole('button', { name: 'Trash' }).click()
    await expect(secondRun.window.getByText('A disposable landing page', { exact: true })).toBeVisible()
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true })
  }
})

test('opens the layout menu and dismisses it', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const run = await launchWorkspace(userDataDirectory)
    activeApp = run.app
    const prompt = run.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A calm analytics dashboard')
    await prompt.press('Enter')
    await expect(run.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()

    await run.window.getByRole('button', { name: /Layout/ }).click()
    const conversationOnly = run.window.getByRole('menuitem', { name: 'Conversation only' })
    await expect(conversationOnly).toBeVisible()

    // The modal menu closes on Escape (and, via its underlay, on any outside click).
    await run.window.keyboard.press('Escape')
    await expect(conversationOnly).toHaveCount(0)
    await expect(run.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()

    await run.app.close()
    activeApp = null
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('pops the preview into its own window and docks it back', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const run = await launchWorkspace(userDataDirectory)
    activeApp = run.app
    const prompt = run.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A calm analytics dashboard')
    await prompt.press('Enter')
    await expect(run.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()
    const dockedWindowCount = run.app.windows().length

    await run.window.getByRole('button', { name: /Layout/ }).click()
    await run.window.getByRole('menuitem', { name: 'Pop out preview' }).click()

    await expect.poll(() => run.app.windows().length).toBeGreaterThan(dockedWindowCount)
    await expect(run.window.getByRole('region', { name: 'Generated design preview' })).toHaveCount(0)

    await run.window.getByRole('button', { name: 'Dock preview' }).click()
    await expect(run.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()
    await expect(run.window.getByRole('button', { name: 'Dock preview' })).toHaveCount(0)

    await run.app.close()
    activeApp = null
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
