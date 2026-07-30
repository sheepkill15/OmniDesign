import { projectDesignDefinitionsSchema } from './contracts.js'
import type { ProjectDesignDefinitions } from './contracts.js'

export function selectProjectDefinitionAnalysisRoots(
  sourceProjectPath: string | null,
  sourceAvailable: boolean,
  designRepositoryPaths: readonly string[],
): { readonly workspacePath: string; readonly referencePaths: readonly string[] } | null {
  const roots = [...new Set([
    ...(sourceProjectPath && sourceAvailable ? [sourceProjectPath] : []),
    ...designRepositoryPaths,
  ])]
  const [workspacePath, ...referencePaths] = roots
  return workspacePath ? { workspacePath, referencePaths } : null
}

export function createProjectDefinitionProposalPrompt(projectName: string): string {
  return `Inspect the linked project and existing OmniDesign design repositories available in your current workspace and propose reusable design definitions for ${projectName}.

Return only one JSON object with exactly this shape:
{
  "schemaVersion": 1,
  "colors": [{ "name": "primary", "value": "#000000", "description": "Short semantic role" }],
  "typography": [{ "name": "body", "fontFamily": "Inter, sans-serif", "fontSize": "1rem", "fontWeight": "400", "lineHeight": "1.5", "letterSpacing": null, "description": "Body copy" }],
  "spacing": [{ "name": "section-gap", "value": "4rem", "description": null }],
  "shape": [{ "name": "control-radius", "value": "0.5rem", "description": null }],
  "visualGuidance": "Concise reusable visual direction.",
  "aiAgentInstructions": "Concise project-specific instructions for agents creating new designs."
}

Use lowercase semantic names separated by hyphens. Prefer actual values already used consistently in the supplied files. Keep the proposal focused and reusable. Although the current provider harness has read-write access to these repositories, do not modify any files. Do not wrap the JSON in Markdown.`
}

export function parseProjectDefinitionProposal(text: string): ProjectDesignDefinitions {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start < 0 || end < start) throw new Error('The provider did not return a design-definition proposal.')
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    throw new Error('The provider returned a malformed design-definition proposal.')
  }
  return projectDesignDefinitionsSchema.parse(parsed)
}

export function createMockProjectDefinitionProposal(projectName: string): ProjectDesignDefinitions {
  return projectDesignDefinitionsSchema.parse({
    schemaVersion: 1,
    colors: [
      { name: 'primary', value: '#6a6262', description: 'Primary actions and emphasis' },
      { name: 'surface', value: '#f4f1ea', description: 'Primary content surface' },
      { name: 'text', value: '#111315', description: 'Default text color' },
    ],
    typography: [{ name: 'body', fontFamily: 'system-ui, sans-serif', fontSize: '1rem', fontWeight: '400', lineHeight: '1.5', letterSpacing: null, description: 'Default interface and body copy' }],
    spacing: [{ name: 'section-gap', value: '4rem', description: 'Separation between major page regions' }],
    shape: [{ name: 'control-radius', value: '0.625rem', description: 'Buttons and form controls' }],
    visualGuidance: `Keep ${projectName} coherent, restrained, responsive, and easy to scan.`,
    aiAgentInstructions: 'Reuse the project semantic tokens, preserve its established interaction patterns, and keep every page accessible and responsive.',
  })
}
