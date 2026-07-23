// Conservative project-name detection for the standalone-design association suggestion: the whole
// project name must appear as a word-bounded phrase in the prompt, and very short names are ignored,
// so a project called "app" or "ui" no longer matches almost every prompt.
//
// Kept out of App.tsx so that file exports only React components (a non-component export there breaks
// React Fast Refresh and forces a full HMR reload).
export function promptMentionsProject(prompt: string, projectName: string): boolean {
  const name = projectName.trim()
  if (name.length < 4) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:$|[^\\p{L}\\p{N}])`, 'iu').test(prompt)
  } catch {
    return prompt.toLocaleLowerCase().includes(name.toLocaleLowerCase())
  }
}
