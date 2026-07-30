import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { shouldEnableUpdates, UpdateService } from './updateService.js'

class FakeUpdater extends EventEmitter {
  autoDownload = false
  autoInstallOnAppQuit = false
  checkForUpdates = vi.fn(async () => undefined)
  quitAndInstall = vi.fn()
}

function createHarness(enabled = true) {
  const updater = new FakeUpdater()
  const promptForRestart = vi.fn(async () => false)
  const beforeInstall = vi.fn()
  const logger = { warn: vi.fn() }
  const service = new UpdateService({ enabled, updater, promptForRestart, beforeInstall, logger })
  return { updater, promptForRestart, beforeInstall, logger, service }
}

describe('UpdateService', () => {
  it('never enables update checks for development processes', () => {
    expect(shouldEnableUpdates(false, 'win32')).toBe(false)
    expect(shouldEnableUpdates(false, 'darwin')).toBe(false)
    expect(shouldEnableUpdates(false, 'linux')).toBe(false)
  })

  it('enables update checks only for packaged Windows and macOS applications', () => {
    expect(shouldEnableUpdates(true, 'win32')).toBe(true)
    expect(shouldEnableUpdates(true, 'darwin')).toBe(true)
    expect(shouldEnableUpdates(true, 'linux')).toBe(false)
  })

  it('checks and downloads updates only when packaged updates are enabled', () => {
    const enabled = createHarness()
    enabled.service.start()
    enabled.service.start()

    expect(enabled.updater.autoDownload).toBe(true)
    expect(enabled.updater.autoInstallOnAppQuit).toBe(true)
    expect(enabled.updater.checkForUpdates).toHaveBeenCalledTimes(1)

    const disabled = createHarness(false)
    disabled.service.start()
    expect(disabled.updater.checkForUpdates).not.toHaveBeenCalled()
  })

  it('offers a downloaded update and installs it after restart confirmation', async () => {
    const harness = createHarness()
    harness.promptForRestart.mockResolvedValue(true)
    harness.service.start()
    harness.updater.emit('update-downloaded', { version: '0.0.42' })

    await vi.waitFor(() => expect(harness.promptForRestart).toHaveBeenCalledWith('0.0.42'))
    expect(harness.beforeInstall).toHaveBeenCalledTimes(1)
    expect(harness.updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('keeps a downloaded update for the next ordinary quit when restart is deferred', async () => {
    const harness = createHarness()
    harness.service.start()
    harness.updater.emit('update-downloaded', { version: '0.0.43' })

    await vi.waitFor(() => expect(harness.promptForRestart).toHaveBeenCalled())
    expect(harness.beforeInstall).not.toHaveBeenCalled()
    expect(harness.updater.quitAndInstall).not.toHaveBeenCalled()
  })

  it('contains update-check and prompt failures and removes listeners on stop', async () => {
    const harness = createHarness()
    harness.updater.checkForUpdates.mockRejectedValue(new Error('offline'))
    harness.promptForRestart.mockRejectedValue(new Error('window closed'))
    harness.service.start()
    harness.updater.emit('update-downloaded', {})

    await vi.waitFor(() => expect(harness.logger.warn).toHaveBeenCalledTimes(2))
    harness.service.stop()
    expect(harness.updater.listenerCount('error')).toBe(0)
    expect(harness.updater.listenerCount('update-downloaded')).toBe(0)
  })
})
