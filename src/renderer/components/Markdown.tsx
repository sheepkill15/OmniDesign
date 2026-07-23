import type { ReactNode } from 'react'

// A small, dependency-free Markdown renderer for agent replies. It builds React nodes directly and
// never injects raw HTML, so untrusted model output cannot smuggle markup or scripts into the trusted
// renderer. It covers what models actually emit: paragraphs, headings, bold/italic, inline code, code
// fences, bullet/numbered lists, blockquotes, horizontal rules, and links (rendered non-navigable).

// One inline token: inline code, bold, italic, or a link. Bold is listed before italic so `**x**`
// matches as bold rather than an empty italic.
const INLINE = /(`[^`\n]+`)|(\*\*[\s\S]+?\*\*|__[\s\S]+?__)|(\*[^*\n]+\*|_[^_\n]+_)|(\[[^\]\n]+\]\([^)\s]+\))/

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let rest = text
  let index = 0
  while (rest.length) {
    const match = INLINE.exec(rest)
    if (!match) { nodes.push(rest); break }
    if (match.index > 0) nodes.push(rest.slice(0, match.index))
    const token = match[0]
    const key = `${keyPrefix}-${index += 1}`
    if (token.startsWith('`')) {
      nodes.push(<code key={key} className="md-code">{token.slice(1, -1)}</code>)
    } else if (token.startsWith('**') || token.startsWith('__')) {
      nodes.push(<strong key={key}>{parseInline(token.slice(2, -2), key)}</strong>)
    } else if (token.startsWith('[')) {
      const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(token)
      const label = link ? link[1] : token
      const url = link ? link[2] : ''
      // Rendered non-navigable (no href) so a model-supplied link can never redirect the trusted
      // window; the URL is exposed on hover for reference.
      nodes.push(<a key={key} className="md-link" {...(/^https?:\/\//i.test(url) ? { title: url } : {})}>{label}</a>)
    } else {
      nodes.push(<em key={key}>{parseInline(token.slice(1, -1), key)}</em>)
    }
    rest = rest.slice(match.index + token.length)
  }
  return nodes
}

export function Markdown({ text }: { readonly text: string }): ReactNode {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let cursor = 0
  let key = 0
  const nextKey = () => `b-${key += 1}`

  while (cursor < lines.length) {
    const line = lines[cursor]

    if (/^\s*```/.test(line)) {
      const body: string[] = []
      cursor += 1
      while (cursor < lines.length && !/^\s*```/.test(lines[cursor])) { body.push(lines[cursor]); cursor += 1 }
      cursor += 1 // closing fence
      blocks.push(<pre key={nextKey()} className="md-pre"><code>{body.join('\n')}</code></pre>)
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push(<p key={nextKey()} className="md-heading" data-level={heading[1].length}>{parseInline(heading[2], nextKey())}</p>)
      cursor += 1
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(<hr key={nextKey()} className="md-hr" />)
      cursor += 1
      continue
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (cursor < lines.length && /^\s*[-*+]\s+/.test(lines[cursor])) { items.push(lines[cursor].replace(/^\s*[-*+]\s+/, '')); cursor += 1 }
      blocks.push(<ul key={nextKey()} className="md-list">{items.map((item, itemIndex) => <li key={itemIndex}>{parseInline(item, `${key}-${itemIndex}`)}</li>)}</ul>)
      continue
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (cursor < lines.length && /^\s*\d+\.\s+/.test(lines[cursor])) { items.push(lines[cursor].replace(/^\s*\d+\.\s+/, '')); cursor += 1 }
      blocks.push(<ol key={nextKey()} className="md-list">{items.map((item, itemIndex) => <li key={itemIndex}>{parseInline(item, `${key}-${itemIndex}`)}</li>)}</ol>)
      continue
    }

    if (/^\s*>\s?/.test(line)) {
      const quoted: string[] = []
      while (cursor < lines.length && /^\s*>\s?/.test(lines[cursor])) { quoted.push(lines[cursor].replace(/^\s*>\s?/, '')); cursor += 1 }
      blocks.push(<blockquote key={nextKey()} className="md-quote">{parseInline(quoted.join(' '), nextKey())}</blockquote>)
      continue
    }

    if (/^\s*$/.test(line)) { cursor += 1; continue }

    // Paragraph: consecutive non-blank lines that do not start another block. Single line breaks are
    // preserved (models use them intentionally in chat replies).
    const paragraph: string[] = []
    while (cursor < lines.length && !/^\s*$/.test(lines[cursor]) && !/^\s*```/.test(lines[cursor]) && !/^#{1,6}\s/.test(lines[cursor]) && !/^\s*[-*+]\s+/.test(lines[cursor]) && !/^\s*\d+\.\s+/.test(lines[cursor]) && !/^\s*>\s?/.test(lines[cursor])) {
      paragraph.push(lines[cursor]); cursor += 1
    }
    const paragraphKey = nextKey()
    blocks.push(<p key={paragraphKey} className="md-paragraph">{paragraph.flatMap((paragraphLine, lineIndex) => {
      const parsed = parseInline(paragraphLine, `${paragraphKey}-${lineIndex}`)
      return lineIndex < paragraph.length - 1 ? [...parsed, <br key={`br-${lineIndex}`} />] : parsed
    })}</p>)
  }

  return <div className="markdown">{blocks}</div>
}
