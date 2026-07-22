import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication } from 'playwright'
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'

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
    await firstRun.window.getByRole('button', { name: 'Rename design' }).click()
    const designTitle = firstRun.window.getByRole('textbox', { name: 'Rename design' })
    await designTitle.fill('Calm signals')
    await firstRun.window.getByRole('button', { name: 'Save' }).click()
    await expect(firstRun.window.getByRole('heading', { name: 'Calm signals' })).toBeVisible()
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
    const exportedDirectory = path.join(userDataDirectory, 'offline-design')
    for (const [relativePath, content] of Object.entries(unzipSync(await readFile(exportPath)))) {
      const destination = path.join(exportedDirectory, relativePath)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, content)
    }
    const exportedDocument = await firstRun.app.evaluate(async ({ BrowserWindow }, fileUrl) => {
      const exportedWindow = new BrowserWindow({ show: false, width: 1440, height: 900, webPreferences: { sandbox: true } })
      try {
        await exportedWindow.loadURL(fileUrl)
        const inspect = async (width: number) => {
          exportedWindow.setContentSize(width, 800)
          return await exportedWindow.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
            const interactive = [...document.querySelectorAll('a[href], button, input, select, textarea, summary')]
            const unnamed = interactive.filter((element) => !element.getAttribute('aria-label') && !element.getAttribute('aria-labelledby') && !element.getAttribute('title') && !element.textContent?.trim())
            resolve({
              width: window.innerWidth,
              horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
              lang: document.documentElement.lang,
              viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content'),
              mainCount: document.querySelectorAll('main').length,
              headingCount: document.querySelectorAll('h1').length,
              unnamedInteractiveCount: unnamed.length,
            })
          })))`)
        }
        return {
          heading: await exportedWindow.webContents.executeJavaScript(`document.querySelector('h1')?.textContent`),
          stylesheet: await exportedWindow.webContents.executeJavaScript(`document.querySelector('link[href=".build/tailwind.css"]') !== null`),
          compact: await inspect(390),
          wide: await inspect(1440),
        }
      } finally {
        exportedWindow.destroy()
      }
    }, pathToFileURL(path.join(exportedDirectory, 'index.html')).href)
    expect(exportedDocument).toMatchObject({
      heading: 'A calm analytics dashboard',
      stylesheet: true,
      compact: { horizontalOverflow: false, lang: 'en', viewport: 'width=device-width, initial-scale=1', mainCount: 1, headingCount: 1, unnamedInteractiveCount: 0 },
      wide: { horizontalOverflow: false, lang: 'en', viewport: 'width=device-width, initial-scale=1', mainCount: 1, headingCount: 1, unnamedInteractiveCount: 0 },
    })
    await firstRun.window.getByRole('button', { name: 'Diagnostics' }).click()
    await expect(firstRun.window.getByRole('heading', { name: 'Diagnostics' })).toBeVisible()
    await expect(firstRun.window.getByText('No diagnostics recorded')).toBeVisible()
    await firstRun.app.close()
    activeApp = null

    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    const recoveredDesign = secondRun.window
      .getByRole('region', { name: 'Continue designing' })
      .getByRole('button')
      .filter({ hasText: 'Calm signals' })
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

test('applies and persists the trusted application theme across primary screens', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-theme-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const firstRun = await launchWorkspace(userDataDirectory)
    activeApp = firstRun.app
    await expect(firstRun.window.getByRole('heading', { name: 'Start with an idea.' })).toBeVisible()
    await expect(firstRun.window.locator('html')).toHaveAttribute('data-theme', 'dark')
    const darkColors = await firstRun.window.evaluate(() => {
      const style = getComputedStyle(document.body)
      return { background: style.backgroundColor, foreground: style.color }
    })

    await firstRun.window.getByRole('button', { name: 'Settings', exact: true }).click()
    await firstRun.window.getByText('Light', { exact: true }).click()
    await expect(firstRun.window.locator('html')).toHaveAttribute('data-theme', 'light')
    const lightColors = await firstRun.window.evaluate(() => {
      const style = getComputedStyle(document.body)
      return { background: style.backgroundColor, foreground: style.color }
    })
    expect(lightColors).not.toEqual(darkColors)

    await firstRun.window.getByRole('button', { name: 'Home', exact: true }).click()
    const prompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A light theme workspace check')
    await prompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await expect(firstRun.window.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(firstRun.window.getByRole('button', { name: /Layout/ })).toBeVisible()
    await firstRun.app.close()
    activeApp = null

    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    await expect(secondRun.window.getByRole('heading', { name: 'Start with an idea.' })).toBeVisible()
    await expect(secondRun.window.locator('html')).toHaveAttribute('data-theme', 'light')
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('confirms close with active work and recovers it as interrupted', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-interruption-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const firstRun = await launchWorkspace(userDataDirectory)
    activeApp = firstRun.app
    const prompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('An interruption recovery check')
    await prompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    const designId = await firstRun.window.evaluate(async () => (await window.omnidesign!.workspace.list())[0].id)
    const database = new DatabaseSync(path.join(userDataDirectory, 'workspace', 'omnidesign.sqlite'))
    database.prepare(`
      INSERT INTO generation_jobs (id, design_id, prompt, provider_id, model_id, effort, attachments_json, mode, state, created_at, started_at, completed_at, error)
      VALUES (?, ?, ?, 'mock', 'mock-v1', NULL, '[]', 'fresh', 'queued', ?, NULL, NULL, NULL)
    `).run('8a348393-c286-40dc-ad06-a1174bfeb5a7', designId, 'Queued before close', new Date().toISOString())
    database.close()
    await firstRun.app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = () => 0
    })

    await firstRun.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
    await expect(firstRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()

    const closed = firstRun.app.waitForEvent('close')
    await firstRun.app.evaluate(({ BrowserWindow, dialog }) => {
      dialog.showMessageBoxSync = () => 1
      BrowserWindow.getAllWindows()[0].close()
    })
    await closed
    activeApp = null

    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    const recoveredDesign = secondRun.window.getByRole('region', { name: 'Continue designing' }).getByRole('button').filter({ hasText: 'An interruption recovery check' })
    await recoveredDesign.click()
    await expect(secondRun.window.getByText('interrupted', { exact: true })).toBeVisible()
    await expect(secondRun.window.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expect(secondRun.window.getByRole('button', { name: 'Retry' })).toBeVisible()
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
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
