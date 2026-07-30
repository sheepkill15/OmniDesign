import { expect, test } from '@playwright/test'
import { _electron as electron } from 'playwright'
import type { ElectronApplication, Page } from 'playwright'
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
    env: { ...process.env, OMNIDESIGN_USER_DATA_DIR: userDataDirectory, OMNIDESIGN_ENABLE_MOCK_PROVIDER: '1', OMNIDESIGN_DISABLE_NOTIFICATIONS: '1', OMNIDESIGN_E2E_HIDE_WINDOWS: '1' },
  })
  return { app, window: await app.firstWindow() }
}

async function continueWithoutDefinitions(window: Page, required = true): Promise<void> {
  const prompt = window.getByRole('dialog', { name: /Set up design definitions for/ })
  if (required) await expect(prompt).toBeVisible()
  else {
    try { await prompt.waitFor({ state: 'visible', timeout: 2_000 }) } catch { return }
  }
  await prompt.getByRole('button', { name: 'Not now' }).click()
  await expect(prompt).toHaveCount(0)
}

async function expectFirstResultUnobstructed(window: Page): Promise<void> {
  await expect(window.getByRole('dialog', { name: /Set up design definitions for/ })).toHaveCount(0)
  await expect(window.getByRole('button', { name: 'Definitions' })).toBeVisible()
}

test('creates and recovers a standalone design in the built Electron app', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const firstRun = await launchWorkspace(userDataDirectory)
    activeApp = firstRun.app
    await firstRun.app.evaluate(({ app, BrowserWindow }) => {
      const trustedWindowId = BrowserWindow.getAllWindows()[0]?.id
      app.once('browser-window-created', (_event, created) => {
        if (created.id === trustedWindowId) return
        created.webContents.capturePage = () => Promise.reject(new Error('Simulated thumbnail capture failure'))
      })
    })
    await expect(firstRun.window.getByRole('heading', { name: 'Start with an idea.' })).toBeVisible()
    const prompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A calm analytics dashboard')
    await prompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await expect(firstRun.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()
    await expect(firstRun.window.getByRole('dialog', { name: /Set up design definitions for/ })).toHaveCount(0)
    await expect(firstRun.window.getByText('Local · quality checked')).toBeVisible({ timeout: 15_000 })
    const designTitle = firstRun.window.getByRole('textbox', { name: 'Rename design' })
    await designTitle.fill('Calm signals')
    await designTitle.press('Enter')
    await expect(firstRun.window.getByRole('textbox', { name: 'Rename design' })).toHaveValue('Calm signals')
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
      const consoleMessages: Array<{ level: number | string; message: string }> = []
      exportedWindow.webContents.on('console-message', (event) => {
        consoleMessages.push({ level: event.level, message: event.message })
      })
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
          disclosure: await exportedWindow.webContents.executeJavaScript(`(() => {
            const details = document.querySelector('details')
            const summary = details?.querySelector('summary')
            const before = details?.open ?? null
            summary?.click()
            return { before, after: details?.open ?? null }
          })()`),
          consoleMessages: consoleMessages.filter((entry) => !entry.message.includes('Electron Security Warning')),
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
      disclosure: { before: false, after: true },
      consoleMessages: [],
      compact: { horizontalOverflow: false, lang: 'en', viewport: 'width=device-width, initial-scale=1', mainCount: 1, headingCount: 1, unnamedInteractiveCount: 0 },
      wide: { horizontalOverflow: false, lang: 'en', viewport: 'width=device-width, initial-scale=1', mainCount: 1, headingCount: 1, unnamedInteractiveCount: 0 },
    })
    await firstRun.app.close()
    activeApp = null

    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    await expect(secondRun.window.getByRole('textbox', { name: 'Rename design' })).toHaveValue('Calm signals')
    await expect(secondRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await secondRun.app.close()
    activeApp = null
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('compares an earlier revision with the current authored file changes', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-compare-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const run = await launchWorkspace(userDataDirectory)
    activeApp = run.app
    const prompt = run.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A calm analytics dashboard')
    await prompt.press('Enter')
    await expect(run.window.getByText('Local · quality checked')).toBeVisible({ timeout: 15_000 })

    const change = run.window.getByRole('textbox', { name: 'Request a design change' })
    await change.fill('Make the dashboard denser and add a compact activity summary')
    await change.press('Enter')
    await expect(run.window.getByRole('button', { name: 'History · 2' })).toBeVisible({ timeout: 15_000 })
    await continueWithoutDefinitions(run.window)
    await run.window.getByRole('button', { name: 'History · 2' }).press('Enter')
    await run.window.getByRole('menuitem', { name: /Request · A calm analytics dashboard/ }).click()
    await run.window.getByRole('button', { name: 'Compare to current' }).click()

    const comparison = run.window.getByRole('dialog', { name: 'Compare revisions' })
    await expect(comparison).toBeVisible()
    await expect(comparison.getByRole('region', { name: 'Authored file changes' })).toContainText('1 authored file changed')
    await expect(comparison.getByRole('region', { name: 'Authored file changes' })).toContainText('index.html')
    await run.app.close()
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
    await expectFirstResultUnobstructed(firstRun.window)
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

    const visitPrimaryScreens = async (theme: 'dark' | 'light') => {
      for (const screen of ['Generations', 'Providers', 'Trash', 'Settings'] as const) {
        await firstRun.window.getByRole('button', { name: screen, exact: true }).click()
        await expect(firstRun.window.getByRole('heading', { name: screen, exact: true })).toBeVisible()
        await expect(firstRun.window.locator('html')).toHaveAttribute('data-theme', theme)
        await expect.poll(() => firstRun.window.evaluate(() => ({
          horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          bodyOverflow: getComputedStyle(document.body).overflow,
          mainOverflow: getComputedStyle(document.querySelector('main')!).overflowY,
        }))).toEqual({ horizontal: false, bodyOverflow: 'hidden', mainOverflow: 'auto' })
      }
    }

    await visitPrimaryScreens('dark')
    await firstRun.window.getByRole('button', { name: 'Home', exact: true }).click()
    const prompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A theme coverage workspace')
    await prompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await expect(firstRun.window.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(firstRun.window.getByRole('button', { name: /Layout/ })).toBeVisible()
    await expectFirstResultUnobstructed(firstRun.window)

    await firstRun.window.getByRole('button', { name: 'Settings', exact: true }).click()
    const notifications = firstRun.window.getByRole('switch', { name: 'System notifications' })
    await expect(notifications).toBeChecked()
    await notifications.press('Space')
    await expect(notifications).not.toBeChecked()
    await firstRun.window.getByText('Light', { exact: true }).click()
    await expect(firstRun.window.locator('html')).toHaveAttribute('data-theme', 'light')
    const lightColors = await firstRun.window.evaluate(() => {
      const style = getComputedStyle(document.body)
      return { background: style.backgroundColor, foreground: style.color }
    })
    expect(lightColors).not.toEqual(darkColors)

    await visitPrimaryScreens('light')
    await firstRun.window.getByRole('button', { name: 'Home', exact: true }).click()
    await firstRun.window.getByRole('button', { name: 'A theme coverage workspace', exact: true }).click()
    await expect(firstRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await expect(firstRun.window.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(firstRun.window.getByRole('button', { name: /Layout/ })).toBeVisible()
    await firstRun.app.close()
    activeApp = null

    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    await expect(secondRun.window.getByRole('heading', { name: 'Start with an idea.' })).toBeVisible()
    await expect(secondRun.window.locator('html')).toHaveAttribute('data-theme', 'light')
    await continueWithoutDefinitions(secondRun.window, false)
    await secondRun.window.getByRole('button', { name: 'Settings', exact: true }).click()
    await expect(secondRun.window.getByRole('switch', { name: 'System notifications' })).not.toBeChecked()
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('keeps the minimum window usable with keyboard and reduced-motion preferences', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-accessibility-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const run = await launchWorkspace(userDataDirectory)
    activeApp = run.app
    await run.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 600))
    await run.window.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' })

    await expect.poll(() => run.window.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    }))).toEqual({ horizontal: false, vertical: false })
    const motion = await run.window.evaluate(() => {
      const spinner = document.createElement('span')
      spinner.className = 'spin'
      document.body.append(spinner)
      const style = getComputedStyle(spinner)
      const result = { duration: Number.parseFloat(style.animationDuration), iterations: style.animationIterationCount }
      spinner.remove()
      return result
    })
    expect(motion.duration).toBeLessThanOrEqual(0.001)
    expect(motion.iterations).toBe('1')

    await run.window.bringToFront()
    await run.window.evaluate(() => { document.body.tabIndex = -1; document.body.focus() })
    let focused = { tag: '', name: '', outline: '' }
    for (let index = 0; index < 4 && focused.tag !== 'BUTTON'; index += 1) {
      await run.window.keyboard.press('Tab')
      focused = await run.window.evaluate(() => ({ tag: document.activeElement?.tagName ?? '', name: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim() ?? '', outline: getComputedStyle(document.activeElement!).outlineStyle }))
    }
    expect(focused.tag).toBe('BUTTON')
    expect(focused.name).not.toBe('')
    expect(focused.outline).toBe('solid')

    const prompt = run.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A compact minimum-window dashboard')
    await prompt.press('Enter')
    await expect(run.window.getByRole('button', { name: 'Send change' })).toBeVisible()
    await expect(run.window.getByRole('button', { name: 'Remove' })).toBeVisible()
    await expect.poll(() => run.window.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      vertical: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    }))).toEqual({ horizontal: false, vertical: false })
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
      VALUES (?, ?, ?, 'mock', 'mock-v1', NULL, '[]', 'fresh', 'running', ?, ?, NULL, NULL)
    `).run('8a348393-c286-40dc-ad06-a1174bfeb5a7', designId, 'Running before close', new Date().toISOString(), new Date().toISOString())
    database.prepare(`
      INSERT INTO generation_jobs (id, design_id, prompt, provider_id, model_id, effort, attachments_json, mode, state, created_at, started_at, completed_at, error)
      VALUES (?, ?, ?, 'mock', 'mock-v1', NULL, '[]', 'fresh', 'queued', ?, NULL, NULL, NULL)
    `).run('9a348393-c286-40dc-ad06-a1174bfeb5a7', designId, 'Queued after interruption', new Date(Date.now() + 1_000).toISOString())
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
    await expect(secondRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await expect(secondRun.window.getByRole('status').filter({ hasText: 'Generation interrupted' })).toBeVisible()
    await expect(secondRun.window.getByRole('button', { name: 'Continue' })).toBeVisible()
    await expect(secondRun.window.getByRole('button', { name: 'Retry' })).toBeVisible()
    const recoveredQueue = secondRun.window.getByRole('region', { name: 'Queued prompts' })
    await expect(recoveredQueue).toContainText('Queued after interruption')
    await recoveredQueue.getByRole('button', { name: 'Remove' }).click()
    await expect(recoveredQueue).toHaveCount(0)
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
    await expectFirstResultUnobstructed(run.window)

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
    await expectFirstResultUnobstructed(run.window)
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

test('creates, organizes, exports, and recovers a multi-page design', async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-phase2-e2e-'))
  let activeApp: ElectronApplication | null = null
  try {
    const firstRun = await launchWorkspace(userDataDirectory)
    activeApp = firstRun.app
    const prompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await prompt.fill('A multi-page product site')
    await prompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()
    await expectFirstResultUnobstructed(firstRun.window)

    await firstRun.window.getByRole('button', { name: 'Preview page' }).click()
    await firstRun.window.getByRole('menuitem', { name: /About A multi-page product site/ }).click()
    await expect(firstRun.window.locator('.preview-focused-fill iframe')).toHaveAttribute('title', /About A multi-page product site/)

    await firstRun.window.getByRole('button', { name: 'Canvas' }).click()
    await expect(firstRun.window.locator('.preview-tile')).toHaveCount(2)
    await firstRun.window.getByRole('button', { name: 'Device size' }).click()
    await firstRun.window.getByRole('menuitem', { name: /Custom/ }).click()
    await firstRun.window.getByRole('textbox', { name: 'Custom preview width' }).fill('1440')
    await firstRun.window.getByRole('textbox', { name: 'Custom preview height' }).fill('960')
    await firstRun.window.getByRole('button', { name: 'Apply size' }).click()
    await firstRun.window.getByRole('button', { name: 'Fixed' }).click()
    await firstRun.window.getByRole('button', { name: 'Zoom in' }).click()

    await expect.poll(() => firstRun.window.evaluate(async () => {
      const current = (await window.omnidesign!.workspace.list())[0]
      return current.layout
    })).toMatchObject({ previewViewMode: 'canvas', previewFit: 'fixed', previewDevice: 'custom', previewCustomWidth: 1440, previewCustomHeight: 960, previewPage: 'pages/about.html', previewZoom: 0.85, previewPanX: 0, previewPanY: 0 })

    const exportPath = path.join(userDataDirectory, 'multi-page-design.zip')
    await firstRun.app.evaluate(({ dialog }, destination) => {
      dialog.showSaveDialog = () => Promise.resolve({ canceled: false, filePath: destination })
    }, exportPath)
    await firstRun.window.getByRole('button', { name: 'Export' }).click()
    await expect.poll(async () => {
      try { return (await stat(exportPath)).size > 0 } catch { return false }
    }).toBe(true)
    const archive = unzipSync(await readFile(exportPath))
    expect(Object.keys(archive)).toEqual(expect.arrayContaining(['index.html', 'pages/about.html', '.build/tailwind.css', '.build/alpine.js']))

    await firstRun.app.close()
    activeApp = null
    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    await expect(secondRun.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()
    await expect(secondRun.window.getByRole('button', { name: 'Canvas' })).toHaveAttribute('aria-pressed', 'true')
    await expect(secondRun.window.getByRole('button', { name: 'Device size' })).toContainText('Custom')
    await expect(secondRun.window.getByRole('button', { name: 'Fixed' })).toHaveAttribute('aria-pressed', 'true')
    await expect(secondRun.window.getByText('85%')).toBeVisible()
    await expect(secondRun.window.locator('.preview-tile')).toHaveCount(2)
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})

test('completes the Phase 3 definitions and exact focused-edit journey across restart', async () => {
  test.setTimeout(180_000)
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-phase3-e2e-'))
  const linkedProjectDirectory = await mkdtemp(path.join(tmpdir(), 'omnidesign-phase3-project-'))
  let activeApp: ElectronApplication | null = null
  try {
    await writeFile(path.join(linkedProjectDirectory, 'README.md'), '# Phase 3 project\n')
    const projectName = path.basename(linkedProjectDirectory)
    const firstRun = await launchWorkspace(userDataDirectory)
    activeApp = firstRun.app
    await firstRun.app.evaluate(({ dialog }, folder) => {
      dialog.showOpenDialog = () => Promise.resolve({ canceled: false, filePaths: [folder] })
    }, linkedProjectDirectory)

    await firstRun.window.getByRole('button', { name: /Standalone design/ }).click()
    await firstRun.window.getByRole('menuitem', { name: 'Choose local project folder…' }).click()
    const firstPrompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await firstPrompt.fill('A Phase 3 seed page')
    await firstPrompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()
    await expect(firstRun.window.getByRole('dialog', { name: `Set up design definitions for ${projectName}?` })).toHaveCount(0)
    await firstRun.window.getByRole('button', { name: 'Definitions', exact: true }).click()
    await expect(firstRun.window.getByRole('heading', { name: 'Design definitions' })).toBeVisible()
    await firstRun.window.getByRole('button', { name: 'Add color' }).click()
    await firstRun.window.getByRole('textbox', { name: 'Name' }).fill('primary')
    await firstRun.window.getByRole('textbox', { name: 'Value' }).fill('#725d78')
    await firstRun.window.getByRole('textbox', { name: 'AI Agent instructions' }).fill('Keep navigation compact and use the semantic project tokens.')
    await firstRun.window.getByRole('button', { name: 'Save definitions' }).click()
    await expect(firstRun.window.getByText('Definitions saved.')).toBeVisible()
    await firstRun.window.getByRole('button', { name: 'Back' }).click()
    await expect(firstRun.window.getByText('Project definitions version 1 is ready.')).toBeVisible()
    await firstRun.window.getByRole('button', { name: 'Keep current design' }).click()

    await firstRun.window.getByRole('button', { name: `New design in ${projectName}` }).click()
    const secondPrompt = firstRun.window.getByRole('textbox', { name: 'What would you like to design?' })
    await secondPrompt.fill('A focused-edit product page')
    await secondPrompt.press('Enter')
    await expect(firstRun.window.getByRole('region', { name: 'Generated design preview' })).toBeVisible()
    await expect(firstRun.window.getByRole('button', { name: 'Definitions', exact: true })).toContainText('v1')

    await firstRun.window.getByRole('button', { name: 'Definitions', exact: true }).click()
    await firstRun.window.getByRole('textbox', { name: 'Value' }).fill('#3f6f68')
    await firstRun.window.getByRole('button', { name: 'Save definitions' }).click()
    await expect(firstRun.window.getByText('Definitions saved.')).toBeVisible()
    await firstRun.window.getByRole('button', { name: 'Back' }).click()
    await expect(firstRun.window.getByText('Project definitions version 2 is ready.')).toBeVisible()
    await firstRun.window.getByRole('button', { name: 'Apply to this design' }).click()
    await expect(firstRun.window.getByRole('button', { name: 'Definitions', exact: true })).toContainText('v2')
    await expect(firstRun.window.getByRole('button', { name: /History · 2/ })).toBeVisible()

    await firstRun.window.getByRole('button', { name: 'Select element' }).click()
    await firstRun.window.frameLocator('.preview-focused-fill iframe').locator('h1').click()
    const focusedEditor = firstRun.window.getByRole('dialog', { name: 'Focused feedback' })
    await expect(focusedEditor).toBeVisible()
    const targetReference = focusedEditor.locator('.focused-comment-context small')
    await expect(targetReference).toContainText(/index\.html:\d+-\d+$/)
    const firstExactReference = (await targetReference.textContent())?.match(/index\.html:\d+-\d+/)?.[0]
    const followUp = focusedEditor.getByRole('textbox', { name: 'Feedback for selected element' })
    await followUp.fill('Make this heading feel more grounded')
    await firstRun.window.getByRole('button', { name: 'Queue', exact: true }).click()
    await expect(focusedEditor).toHaveCount(0)
    await expect(firstRun.window.getByText('1 focused note queued')).toBeVisible()
    const firstMarker = firstRun.window.getByRole('button', { name: 'Focused edit thread 1, 1 comment, 1 pending' })
    await expect(firstMarker).toBeVisible()
    await firstMarker.hover()
    await expect(firstRun.window.getByText('Make this heading feel more grounded')).toBeVisible()

    await firstRun.window.frameLocator('.preview-focused-fill iframe').locator('section').nth(1).click()
    await expect(focusedEditor).toBeVisible()
    await expect(targetReference).toContainText(/index\.html:\d+-\d+$/)
    const secondExactReference = (await targetReference.textContent())?.match(/index\.html:\d+-\d+/)?.[0]
    await focusedEditor.getByRole('textbox', { name: 'Feedback for selected element' }).fill('Give this feature block more breathing room')
    await firstRun.window.getByRole('button', { name: 'Queue', exact: true }).click()
    await expect(firstRun.window.getByText('2 focused notes queued')).toBeVisible()
    const secondMarker = firstRun.window.getByRole('button', { name: 'Focused edit thread 2, 1 comment, 1 pending' })
    await expect(secondMarker).toBeVisible()
    await secondMarker.hover()
    await expect(firstRun.window.getByText('Give this feature block more breathing room')).toBeVisible()
    await firstRun.window.getByRole('button', { name: 'Fix all' }).click()
    await expect(firstRun.window.getByRole('region', { name: 'Focused feedback queue' })).toHaveCount(0)
    await expect(firstRun.window.getByRole('button', { name: /History · 3/ })).toBeVisible()

    const persisted = await firstRun.window.evaluate(async () => {
      const current = (await window.omnidesign!.workspace.list()).find((design) => design.title === 'A focused-edit product page')!
      const submitted = [...current.messages].reverse().find((message) => message.focusedFeedback?.length)
      return {
        definitionVersion: current.definitionVersion,
        focusedFeedback: submitted?.focusedFeedback,
        revisions: current.revisions.length,
      }
    })
    expect(persisted).toMatchObject({
      definitionVersion: 2,
      focusedFeedback: [
        { comment: 'Make this heading feel more grounded', target: { path: 'index.html', startLine: expect.any(Number), endLine: expect.any(Number) } },
        { comment: 'Give this feature block more breathing room', target: { path: 'index.html', startLine: expect.any(Number), endLine: expect.any(Number) } },
      ],
      revisions: 3,
    })
    expect(firstExactReference).toBe(`index.html:${persisted.focusedFeedback![0].target.startLine}-${persisted.focusedFeedback![0].target.endLine}`)
    expect(secondExactReference).toBe(`index.html:${persisted.focusedFeedback![1].target.startLine}-${persisted.focusedFeedback![1].target.endLine}`)
    await firstRun.app.close()
    activeApp = null

    const database = new DatabaseSync(path.join(userDataDirectory, 'workspace', 'omnidesign.sqlite'))
    const applicationAttempt = database.prepare(`
      SELECT state, mechanism, resulting_revision_id FROM project_definition_application_attempts
      WHERE target_version = 2 ORDER BY created_at DESC LIMIT 1
    `).get() as { state: string; mechanism: string; resulting_revision_id: string | null }
    database.close()
    expect(applicationAttempt).toMatchObject({ state: 'completed', mechanism: 'deterministic', resulting_revision_id: expect.any(String) })

    const secondRun = await launchWorkspace(userDataDirectory)
    activeApp = secondRun.app
    await expect(secondRun.window.getByRole('region', { name: 'Design conversation' })).toBeVisible()
    await expect(secondRun.window.locator('[aria-label="Submitted focused feedback"]')).toBeVisible()
    await expect(secondRun.window.getByText('Make this heading feel more grounded', { exact: false })).toBeVisible()
    await expect(secondRun.window.getByText(firstExactReference!, { exact: false })).toBeVisible()
    await expect(secondRun.window.getByText(secondExactReference!, { exact: false })).toBeVisible()
    await expect(secondRun.window.getByRole('button', { name: 'Definitions', exact: true })).toContainText('v2')
    await expect(secondRun.window.getByRole('button', { name: /History · 3/ })).toBeVisible()
  } finally {
    await activeApp?.close().catch(() => undefined)
    await rm(userDataDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
    await rm(linkedProjectDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
})
