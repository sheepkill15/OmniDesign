import { createHash } from 'node:crypto'
import { parse, type DefaultTreeAdapterMap } from 'parse5'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

export interface FocusedSourceLocation {
  readonly id: string
  readonly path: string
  readonly startLine: number
  readonly endLine: number
  readonly label: string
  readonly stableId: string | null
  readonly excerpt: string
  readonly attributeStart: number | null
  readonly attributeEnd: number | null
  readonly insertionOffset: number
}

function isElement(node: Node): node is Element {
  return 'tagName' in node && Array.isArray(node.attrs)
}

function attribute(element: Element, name: string): string | null {
  return element.attrs.find((candidate) => candidate.name.toLowerCase() === name)?.value ?? null
}

function labelFor(element: Element): string {
  const id = attribute(element, 'id')
  const classes = attribute(element, 'class')?.trim().split(/\s+/).filter(Boolean).slice(0, 2) ?? []
  return `<${element.tagName}${id ? `#${id}` : ''}${classes.map((name) => `.${name}`).join('')}>`.slice(0, 200)
}

function excerptFor(html: string, startOffset: number, endOffset: number): string {
  const source = html.slice(startOffset, endOffset)
  if (source.length <= 4_000) return source
  return `${source.slice(0, 2_000)}\n…\n${source.slice(-1_999)}`
}

function sourceLocationId(pagePath: string, startOffset: number, endOffset: number): string {
  const digest = createHash('sha256').update(`${pagePath}\0${startOffset}\0${endOffset}`).digest('hex')
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

export function buildFocusedSourceMap(html: string, pagePath: string): FocusedSourceLocation[] {
  const document = parse(html, { sourceCodeLocationInfo: true })
  const locations: FocusedSourceLocation[] = []
  const visit = (node: Node) => {
    if (isElement(node)) {
      const location = node.sourceCodeLocation
      const startTag = location?.startTag
      if (location && startTag) {
        const authoredAttribute = location.attrs?.['data-od-source-key']
        const stableId = node.attrs.find((candidate) => candidate.name.startsWith('data-od-') && candidate.name !== 'data-od-source-key')?.value ?? null
        locations.push({
          id: sourceLocationId(pagePath, location.startOffset, location.endOffset),
          path: pagePath,
          startLine: location.startLine,
          endLine: Math.max(location.startLine, location.endLine - (html[location.endOffset - 1] === '\n' ? 1 : 0)),
          label: labelFor(node),
          stableId: stableId?.slice(0, 500) ?? null,
          excerpt: excerptFor(html, location.startOffset, location.endOffset),
          attributeStart: authoredAttribute?.startOffset ?? null,
          attributeEnd: authoredAttribute?.endOffset ?? null,
          insertionOffset: startTag.endOffset - (html[startTag.endOffset - 2] === '/' ? 2 : 1),
        })
      }
    }
    if ('childNodes' in node) for (const child of node.childNodes) visit(child)
    if ('content' in node) visit(node.content)
  }
  visit(document)
  return locations
}

export function injectFocusedSourceKeys(html: string, locations: readonly FocusedSourceLocation[]): string {
  const edits = locations.map((location) => location.attributeStart !== null && location.attributeEnd !== null
    ? { start: location.attributeStart, end: location.attributeEnd, text: `data-od-source-key="${location.id}"` }
    : { start: location.insertionOffset, end: location.insertionOffset, text: ` data-od-source-key="${location.id}"` })
    .sort((first, second) => second.start - first.start)
  let result = html
  for (const edit of edits) result = result.slice(0, edit.start) + edit.text + result.slice(edit.end)
  return result
}
