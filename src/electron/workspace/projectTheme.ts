import path from 'node:path'
import type { ProjectDesignDefinitionVersion, ProjectDesignDefinitions } from './contracts.js'
import type { RevisionFiles } from './designRepository.js'

export const PROJECT_THEME_PATH = 'omnidesign.theme.css'

function cssDeclaration(name: string, value: string): string {
  return `  ${name}: ${value};`
}

export function createProjectThemeCss(version: ProjectDesignDefinitionVersion): string {
  const { definitions } = version
  const declarations = [
    ...definitions.colors.map((token) => cssDeclaration(`--od-color-${token.name}`, token.value)),
    ...definitions.typography.flatMap((token) => [
      cssDeclaration(`--od-font-${token.name}-family`, token.fontFamily),
      cssDeclaration(`--od-font-${token.name}-size`, token.fontSize),
      cssDeclaration(`--od-font-${token.name}-weight`, token.fontWeight),
      cssDeclaration(`--od-font-${token.name}-line-height`, token.lineHeight),
      ...(token.letterSpacing ? [cssDeclaration(`--od-font-${token.name}-letter-spacing`, token.letterSpacing)] : []),
    ]),
    ...definitions.spacing.map((token) => cssDeclaration(`--od-space-${token.name}`, token.value)),
    ...definitions.shape.map((token) => cssDeclaration(`--od-shape-${token.name}`, token.value)),
  ]
  return `/* OmniDesign project definitions v${version.version}. Managed by OmniDesign. */\n:root {\n${declarations.join('\n')}\n}\n`
}

function themeHref(htmlPath: string): string {
  const relative = path.posix.relative(path.posix.dirname(htmlPath), PROJECT_THEME_PATH)
  return relative.startsWith('.') ? relative : `./${relative}`
}

function injectThemeLink(html: string, htmlPath: string, version: number): string {
  const existingThemeLink = /<link\b[^>]*(?:data-omnidesign-theme\s*=|omnidesign\.theme\.css)[^>]*>/i
  if (existingThemeLink.test(html)) {
    return html.replace(existingThemeLink, (tag) => /data-omnidesign-theme\s*=\s*["'][^"']*["']/i.test(tag)
      ? tag.replace(/data-omnidesign-theme\s*=\s*["'][^"']*["']/i, `data-omnidesign-theme="${version}"`)
      : tag.replace(/>$/, ` data-omnidesign-theme="${version}">`))
  }
  const link = `  <link rel="stylesheet" href="${themeHref(htmlPath)}" data-omnidesign-theme="${version}">\n`
  const buildLink = /\s*<link\s+rel=["']stylesheet["']\s+href=["'][^"']*\.build\/tailwind\.css["'][^>]*>\s*/i
  if (buildLink.test(html)) return html.replace(buildLink, (match) => `\n${link}${match.trim()}\n`)
  return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${link}</head>`) : html
}

function names(values: readonly { readonly name: string }[]): Set<string> {
  return new Set(values.map((value) => value.name))
}

function retainsEveryName(current: readonly { readonly name: string }[], target: readonly { readonly name: string }[]): boolean {
  const targetNames = names(target)
  return [...names(current)].every((name) => targetNames.has(name))
}

export function canUpdateProjectThemeDeterministically(current: ProjectDesignDefinitions, target: ProjectDesignDefinitions): boolean {
  return current.visualGuidance === target.visualGuidance
    && current.aiAgentInstructions === target.aiAgentInstructions
    && retainsEveryName(current.colors, target.colors)
    && retainsEveryName(current.typography, target.typography)
    && retainsEveryName(current.spacing, target.spacing)
    && retainsEveryName(current.shape, target.shape)
}

export function materializeProjectTheme(files: RevisionFiles, version: ProjectDesignDefinitionVersion): RevisionFiles {
  const materialized: Record<string, string> = { ...files, [PROJECT_THEME_PATH]: createProjectThemeCss(version) }
  for (const [relativePath, content] of Object.entries(files)) {
    if (/\.html?$/i.test(relativePath)) materialized[relativePath] = injectThemeLink(content, relativePath, version.version)
  }
  return materialized
}

export function createProjectDefinitionPromptContext(version: ProjectDesignDefinitionVersion): string {
  const definitions: ProjectDesignDefinitions = version.definitions
  return [
    `Project design definitions version ${version.version} apply to this new design.`,
    `OmniDesign has materialized their CSS custom properties in ${PROJECT_THEME_PATH}; keep every page linked to that stylesheet and use its semantic variables consistently.`,
    definitions.visualGuidance ? `Visual guidance:\n${definitions.visualGuidance}` : '',
    definitions.aiAgentInstructions ? `AI Agent instructions:\n${definitions.aiAgentInstructions}` : '',
    `Structured definitions:\n${JSON.stringify({ colors: definitions.colors, typography: definitions.typography, spacing: definitions.spacing, shape: definitions.shape }, null, 2)}`,
  ].filter(Boolean).join('\n\n')
}

export function createProjectDefinitionApplicationPrompt(current: ProjectDesignDefinitionVersion | null, target: ProjectDesignDefinitionVersion): string {
  return [
    `Apply project design definitions version ${target.version} to the current design.`,
    'Update the design itself wherever interpretation or structural work is required. Preserve its purpose and interaction behavior while adopting the new shared system.',
    `OmniDesign will materialize the target CSS variables in ${PROJECT_THEME_PATH} before validating the result. Use those semantic variables consistently and keep every page linked to that stylesheet.`,
    'Supporting HTML, CSS, JavaScript, and shared components may be changed as needed.',
    `Previous definitions:\n${current ? JSON.stringify(current.definitions, null, 2) : 'None; migrate literal design values into the managed theme.'}`,
    `Target definitions:\n${JSON.stringify(target.definitions, null, 2)}`,
  ].join('\n\n')
}
