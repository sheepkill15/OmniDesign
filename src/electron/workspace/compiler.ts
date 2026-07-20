import { compile } from '@tailwindcss/node'
import path from 'node:path'

const classAttributePattern = /class\s*=\s*["']([^"']+)["']/g

export function collectTailwindCandidates(html: string): string[] {
  const candidates = new Set<string>()
  for (const match of html.matchAll(classAttributePattern)) {
    for (const candidate of match[1].split(/\s+/)) {
      if (candidate) candidates.add(candidate)
    }
  }
  return [...candidates]
}

export async function compileDesignHtml(html: string): Promise<string> {
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) {
    throw new Error('Generated design must contain html and body elements.')
  }

  const compiler = await compile('@import "tailwindcss";', {
    base: path.resolve('.'),
    onDependency: () => undefined,
  })
  const css = compiler.build(collectTailwindCandidates(html))
  const style = `<style>${css}</style>`
  return html.includes('</head>') ? html.replace('</head>', `${style}\n</head>`) : `${style}\n${html}`
}

export function validateCompiledDesign(html: string): void {
  const blockedPatterns = [
    /<script\b/i,
    /\son\w+\s*=/i,
    /(?:src|href)\s*=\s*["'](?:https?:|file:|javascript:)/i,
  ]
  if (blockedPatterns.some((pattern) => pattern.test(html))) {
    throw new Error('Generated design contains scripts, external resources, or unsafe event handlers.')
  }
}
