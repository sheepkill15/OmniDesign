import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const stylesheet = readFileSync(path.resolve('src/renderer/styles.css'), 'utf8')

function themeBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = stylesheet.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))
  if (!match) throw new Error(`Missing theme block: ${selector}`)
  return match[1]
}

function token(block: string, name: string): string {
  const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`Missing color token: ${name}`)
  return match[1]
}

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/.{2}/g)!.map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function contrast(foreground: string, background: string): number {
  const foregroundLuminance = luminance(foreground)
  const backgroundLuminance = luminance(background)
  return (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) / (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
}

describe('trusted interface color tokens', () => {
  it.each([
    { name: 'dark', selector: ':root' },
    { name: 'light', selector: ":root[data-theme='light']" },
  ])('keeps faint metadata at WCAG AA contrast in the $name theme', ({ selector }) => {
    const block = themeBlock(selector)
    const faint = token(block, 'text-faint')
    for (const surface of ['background', 'surface-1', 'surface-2', 'surface-3']) {
      expect(contrast(faint, token(block, surface)), `${surface} contrast`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
