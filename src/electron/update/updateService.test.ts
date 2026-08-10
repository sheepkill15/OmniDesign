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
  const canInstall = vi.fn((): string | null => null)
  const beforeInstall = vi.fn()
  const onStateChange = vi.fn()
  const logger = { warn: vi.fn() }
  const service = new UpdateService({ enabled, updater, canInstall, beforeInstall, onStateChange, logger })
  return { updater, canInstall, beforeInstall, onStateChange, logger, service }
}

describe('UpdateService', () => {
  it('never enables update checks for development processes', () => {
    expect(shouldEnableUpdates(false, 'win32')).toBe(false)
    expect(shouldEnableUpdates(false, 'darwin')).toBe(false)
    expect(shouldEnableUpdates(false, 'linux')).toBe(false)
  })

  it('enables update checks only for packaged Windows applications while macOS builds are unsigned', () => {
    expect(shouldEnableUpdates(true, 'win32')).toBe(true)
    expect(shouldEnableUpdates(true, 'darwin')).toBe(false)
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

  it('reports numeric download progress and installs a ready update from one explicit action', () => {
    const harness = createHarness()
    harness.service.start()
    harness.updater.emit('update-available', {})
    harness.updater.emit('download-progress', { percent: 47.6 })
    expect(harness.service.getState()).toEqual({ kind: 'downloading', percent: 48 })
    harness.updater.emit('update-downloaded', { version: '0.0.42' })
    expect(harness.service.getState()).toEqual({ kind: 'ready', version: '0.0.42', blockedReason: null })
    expect(harness.updater.quitAndInstall).not.toHaveBeenCalled()
    harness.service.install()
    expect(harness.beforeInstall).toHaveBeenCalledTimes(1)
    expect(harness.updater.quitAndInstall).toHaveBeenCalledWith(false, true)
  })

  it('keeps a ready update blocked until active work is safe and requires another click', () => {
    const harness = createHarness()
    harness.canInstall.mockReturnValue('A branch combination is still running.')
    harness.service.start()
    harness.updater.emit('update-downloaded', { version: '0.0.43' })
    expect(harness.service.install()).toEqual({ kind: 'ready', version: '0.0.43', blockedReason: 'A branch combination is still running.' })
    expect(harness.beforeInstall).not.toHaveBeenCalled()
    expect(harness.updater.quitAndInstall).not.toHaveBeenCalled()
    harness.canInstall.mockReturnValue(null)
    expect(harness.updater.quitAndInstall).not.toHaveBeenCalled()
    harness.service.install()
    expect(harness.updater.quitAndInstall).toHaveBeenCalledTimes(1)
  })

  it('exposes download failure and retries through the existing updater flow', async () => {
    const harness = createHarness()
    harness.service.start()
    harness.updater.emit('error', new Error('offline'))
    expect(harness.service.getState()).toEqual({ kind: 'failed', message: 'offline' })
    harness.service.retry()
    expect(harness.service.getState()).toEqual({ kind: 'checking' })
    expect(harness.updater.checkForUpdates).toHaveBeenCalledTimes(2)
  })

  it('contains update-check failures and removes every listener on stop', async () => {
    const harness = createHarness()
    harness.updater.checkForUpdates.mockRejectedValue(new Error('offline'))
    harness.service.start()

    await vi.waitFor(() => expect(harness.logger.warn).toHaveBeenCalledTimes(1))
    expect(harness.service.getState()).toEqual({ kind: 'failed', message: 'offline' })
    harness.service.stop()
    expect(harness.updater.listenerCount('error')).toBe(0)
    expect(harness.updater.listenerCount('download-progress')).toBe(0)
    expect(harness.updater.listenerCount('update-downloaded')).toBe(0)
  })
})
