import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { designSchema, generationJobSchema, generationSelectionSchema, layoutSchema, projectSummarySchema, themeSchema } from './contracts.js'
import type { Design, GenerationJob, GenerationJobState, GenerationSelection, GenerationStep, InvalidCandidate, Layout, Message, PreviewDiagnostic, ProjectSummary, Revision, Theme, TrashItem } from './contracts.js'

// The final path segment of a linked source folder, tolerant of both Windows and POSIX separators
// regardless of the host the store runs on.
function folderName(sourcePath: string): string {
  return sourcePath.split(/[\\/]/).filter(Boolean).at(-1) ?? sourcePath
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return undefined
  }
}

interface DesignRow {
  id: string
  project_id: string
  project_name: string
  source_path: string | null
  title: string
  created_at: string
  updated_at: string
  active_revision_id: string | null
  selected_revision_id: string | null
  draft: string
  layout_json: string
  thumbnail_path: string | null
  queue_paused: number
  last_provider_id: string
  last_model_id: string
  last_effort: string | null
}

interface ProjectRow {
  id: string
  name: string
  kind: 'standalone' | 'linked'
  source_path: string | null
  created_at: string
  updated_at: string
  design_count: number
  last_design_activity: string | null
}

interface TrashRow {
  id: string
  kind: 'project' | 'design'
  name: string
  project_id: string | null
  project_name: string | null
  source_path: string | null
  trashed_at: string
}

interface GenerationStepRow {
  id: string
  stage: string
  label: string
  detail: string | null
  created_at: string
}

interface RevisionRow {
  id: string
  parent_revision_id: string | null
  prompt: string
  provider_id: string
  model_id: string
  git_commit: string | null
  created_at: string
}

interface MessageRow {
  id: string
  role: Message['role']
  text: string
  created_at: string
}

interface PreviewDiagnosticRow {
  id: string
  kind: PreviewDiagnostic['kind']
  level: PreviewDiagnostic['level']
  message: string
  source: string | null
  line: number | null
  created_at: string
}

interface InvalidCandidateRow {
  id: string
  prompt: string
  candidate_path: string
  diagnostic: string
  created_at: string
}

interface GenerationJobRow {
  id: string
  design_id: string
  prompt: string
  provider_id: 'mock' | 'codex' | 'claude'
  model_id: string
  effort: string | null
  state: GenerationJobState
  created_at: string
  started_at: string | null
  completed_at: string | null
  error: string | null
}

const migrationOne = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
) STRICT;
CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('standalone', 'linked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE designs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  active_revision_id TEXT,
  selected_revision_id TEXT,
  draft TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
) STRICT;
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE TABLE revisions (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  parent_revision_id TEXT REFERENCES revisions(id),
  prompt TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  html_path TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX designs_by_activity ON designs(updated_at DESC);
CREATE INDEX messages_by_design ON messages(design_id, created_at);
CREATE INDEX revisions_by_design ON revisions(design_id, created_at);
`

const migrationTwo = `
CREATE TABLE preview_diagnostics (
  id TEXT PRIMARY KEY,
  revision_id TEXT NOT NULL REFERENCES revisions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('console', 'runtime', 'load')),
  level TEXT NOT NULL CHECK (level IN ('warning', 'error')),
  message TEXT NOT NULL,
  source TEXT,
  line INTEGER,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX preview_diagnostics_by_revision ON preview_diagnostics(revision_id, created_at);
`

const migrationThree = `
ALTER TABLE designs ADD COLUMN layout_json TEXT NOT NULL DEFAULT '{"conversationWidth":43}';
`

const migrationFour = `
ALTER TABLE designs ADD COLUMN thumbnail_path TEXT;
`

const migrationFive = `
CREATE TABLE revision_thumbnails (
  revision_id TEXT PRIMARY KEY REFERENCES revisions(id) ON DELETE CASCADE,
  thumbnail_path TEXT NOT NULL
) STRICT;
INSERT OR IGNORE INTO revision_thumbnails (revision_id, thumbnail_path)
SELECT active_revision_id, thumbnail_path FROM designs
WHERE active_revision_id IS NOT NULL AND thumbnail_path IS NOT NULL;
`

const migrationSix = `
CREATE TABLE invalid_candidates (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  candidate_path TEXT NOT NULL UNIQUE,
  diagnostic TEXT NOT NULL,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX invalid_candidates_by_design ON invalid_candidates(design_id, created_at);
`

const migrationSeven = `
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
`

const migrationEight = `
CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT
) STRICT;
CREATE INDEX generation_jobs_by_design ON generation_jobs(design_id, created_at);
CREATE INDEX generation_jobs_by_state ON generation_jobs(state, created_at);
`

const migrationNine = `
ALTER TABLE generation_jobs RENAME TO generation_jobs_previous;
CREATE TABLE generation_jobs (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT
) STRICT;
INSERT INTO generation_jobs (id, design_id, prompt, state, created_at, started_at, completed_at, error)
SELECT id, design_id, prompt, state, created_at, started_at, completed_at, error FROM generation_jobs_previous;
DROP TABLE generation_jobs_previous;
CREATE INDEX generation_jobs_by_design ON generation_jobs(design_id, created_at);
CREATE INDEX generation_jobs_by_state ON generation_jobs(state, created_at);
`

const migrationTen = `
ALTER TABLE designs ADD COLUMN queue_paused INTEGER NOT NULL DEFAULT 0 CHECK (queue_paused IN (0, 1));
`

const migrationEleven = `
ALTER TABLE revisions ADD COLUMN git_commit TEXT;
`

const migrationTwelve = `
ALTER TABLE generation_jobs ADD COLUMN provider_id TEXT NOT NULL DEFAULT 'mock' CHECK (provider_id IN ('mock', 'codex', 'claude'));
ALTER TABLE generation_jobs ADD COLUMN model_id TEXT NOT NULL DEFAULT 'mock-v1';
`

const migrationThirteen = `
ALTER TABLE projects ADD COLUMN source_path TEXT;
CREATE UNIQUE INDEX projects_by_source_path ON projects(source_path) WHERE source_path IS NOT NULL;
`

const migrationFourteen = `
ALTER TABLE generation_jobs ADD COLUMN effort TEXT;
`

const migrationFifteen = `
ALTER TABLE designs ADD COLUMN last_provider_id TEXT NOT NULL DEFAULT 'mock' CHECK (last_provider_id IN ('mock', 'codex', 'claude'));
ALTER TABLE designs ADD COLUMN last_model_id TEXT NOT NULL DEFAULT 'mock-v1';
ALTER TABLE designs ADD COLUMN last_effort TEXT;
`

const migrationSixteen = `
CREATE TABLE generation_steps (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  job_id TEXT,
  stage TEXT NOT NULL,
  label TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
) STRICT;
CREATE INDEX generation_steps_by_design ON generation_steps(design_id, created_at);
`

// Revision content now lives in Git (each revision is a commit); the previous per-revision HTML copy
// under designs/<id>/revisions/<revId>/index.html is gone, so the html_path column is dropped. Rebuild
// the table because SQLite cannot drop a UNIQUE column in place. Runs with foreign keys disabled.
const migrationSeventeen = `
CREATE TABLE revisions_rebuilt (
  id TEXT PRIMARY KEY,
  design_id TEXT NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
  parent_revision_id TEXT REFERENCES revisions(id),
  prompt TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  git_commit TEXT,
  created_at TEXT NOT NULL
) STRICT;
INSERT INTO revisions_rebuilt (id, design_id, parent_revision_id, prompt, provider_id, model_id, git_commit, created_at)
  SELECT id, design_id, parent_revision_id, prompt, provider_id, model_id, git_commit, created_at FROM revisions;
DROP TABLE revisions;
ALTER TABLE revisions_rebuilt RENAME TO revisions;
CREATE INDEX revisions_by_design ON revisions(design_id, created_at);
`

const migrationEighteen = `
ALTER TABLE projects ADD COLUMN trashed_at TEXT;
ALTER TABLE designs ADD COLUMN trashed_at TEXT;
CREATE INDEX projects_by_trash ON projects(trashed_at);
CREATE INDEX designs_by_trash ON designs(trashed_at);
`

export class WorkspaceStore {
  private readonly database: DatabaseSync
  private readonly artifactsDirectory: string

  public constructor(storageDirectory: string) {
    mkdirSync(storageDirectory, { recursive: true })
    this.artifactsDirectory = path.join(storageDirectory, 'designs')
    mkdirSync(this.artifactsDirectory, { recursive: true })
    this.database = new DatabaseSync(path.join(storageDirectory, 'omnidesign.sqlite'), { timeout: 5_000 })
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;')
    this.migrate()
    this.purgeExpiredTrash()
  }

  public close(): void {
    this.database.close()
  }

  public getDesignArtifactsDirectory(): string {
    return this.artifactsDirectory
  }

  public listDesigns(): Design[] {
    const rows = this.database.prepare(`
      SELECT d.id, d.project_id, p.name AS project_name, p.source_path, d.title, d.created_at, d.updated_at,
             d.active_revision_id, d.selected_revision_id, d.draft, d.layout_json, d.thumbnail_path, d.queue_paused,
             d.last_provider_id, d.last_model_id, d.last_effort
      FROM designs d JOIN projects p ON p.id = d.project_id
      WHERE d.trashed_at IS NULL AND p.trashed_at IS NULL
      ORDER BY d.updated_at DESC
    `).all() as unknown as DesignRow[]
    return rows.map((row) => this.hydrateDesign(row))
  }

  public getDesign(designId: string): Design | null {
    const row = this.database.prepare(`
      SELECT d.id, d.project_id, p.name AS project_name, p.source_path, d.title, d.created_at, d.updated_at,
             d.active_revision_id, d.selected_revision_id, d.draft, d.layout_json, d.thumbnail_path, d.queue_paused,
             d.last_provider_id, d.last_model_id, d.last_effort
      FROM designs d JOIN projects p ON p.id = d.project_id WHERE d.id = ? AND d.trashed_at IS NULL AND p.trashed_at IS NULL
    `).get(designId) as unknown as DesignRow | undefined
    return row ? this.hydrateDesign(row) : null
  }

  public listProjects(): ProjectSummary[] {
    const rows = this.database.prepare(`
      SELECT p.id, p.name, p.kind, p.source_path, p.created_at, p.updated_at,
             COUNT(d.id) AS design_count,
             MAX(d.updated_at) AS last_design_activity
      FROM projects p
      LEFT JOIN designs d ON d.project_id = p.id AND d.trashed_at IS NULL
      WHERE p.trashed_at IS NULL
      GROUP BY p.id
      ORDER BY COALESCE(MAX(d.updated_at), p.updated_at) DESC, p.rowid DESC
    `).all() as unknown as ProjectRow[]
    return rows.map((row) => this.hydrateProject(row))
  }

  public getProjectSummary(projectId: string): ProjectSummary | null {
    const row = this.database.prepare(`
      SELECT p.id, p.name, p.kind, p.source_path, p.created_at, p.updated_at,
             COUNT(d.id) AS design_count,
             MAX(d.updated_at) AS last_design_activity
      FROM projects p
      LEFT JOIN designs d ON d.project_id = p.id AND d.trashed_at IS NULL
      WHERE p.id = ? AND p.trashed_at IS NULL
      GROUP BY p.id
    `).get(projectId) as unknown as ProjectRow | undefined
    return row ? this.hydrateProject(row) : null
  }

  public listDesignsByProject(projectId: string): Design[] {
    const rows = this.database.prepare(`
      SELECT d.id, d.project_id, p.name AS project_name, p.source_path, d.title, d.created_at, d.updated_at,
             d.active_revision_id, d.selected_revision_id, d.draft, d.layout_json, d.thumbnail_path, d.queue_paused,
             d.last_provider_id, d.last_model_id, d.last_effort
      FROM designs d JOIN projects p ON p.id = d.project_id
      WHERE d.project_id = ? AND d.trashed_at IS NULL
      ORDER BY d.updated_at DESC, d.rowid DESC
    `).all(projectId) as unknown as DesignRow[]
    return rows.map((row) => this.hydrateDesign(row))
  }

  public findProjectBySourcePath(sourcePath: string): string | null {
    const row = this.database.prepare('SELECT id FROM projects WHERE source_path = ? AND trashed_at IS NULL').get(sourcePath) as { id: string } | undefined
    return row?.id ?? null
  }

  public createStandaloneDesign(prompt: string, title: string): Design {
    const projectId = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO projects (id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(projectId, title, 'standalone', now, now)
    return this.createDesignInProject(projectId, prompt, title)
  }

  // Linking a folder that OmniDesign already tracks reuses that project instead of registering a
  // duplicate, so opening the same folder twice adds a design rather than a second project. A linked
  // project is named after its source folder, not the design generated inside it.
  public createLinkedDesign(prompt: string, title: string, sourcePath: string): Design {
    const existingProjectId = this.findProjectBySourcePath(sourcePath)
    if (existingProjectId) return this.createDesignInProject(existingProjectId, prompt, title)
    const projectId = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO projects (id, name, kind, source_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(projectId, folderName(sourcePath), 'linked', sourcePath, now, now)
    return this.createDesignInProject(projectId, prompt, title)
  }

  public registerLinkedProject(sourcePath: string): ProjectSummary {
    const existingProjectId = this.findProjectBySourcePath(sourcePath)
    if (existingProjectId) return this.getProjectSummary(existingProjectId)!
    const projectId = randomUUID()
    const now = new Date().toISOString()
    this.database.prepare('INSERT INTO projects (id, name, kind, source_path, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(projectId, folderName(sourcePath), 'linked', sourcePath, now, now)
    return this.getProjectSummary(projectId)!
  }

  public createDesignInProject(projectId: string, prompt: string, title: string): Design {
    const designId = randomUUID()
    const now = new Date().toISOString()
    this.transaction(() => {
      const project = this.database.prepare('SELECT id FROM projects WHERE id = ? AND trashed_at IS NULL').get(projectId)
      if (!project) throw new Error('Project not found.')
      this.database.prepare('INSERT INTO designs (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(designId, projectId, title, now, now)
      if (prompt) {
        this.database.prepare('INSERT INTO messages (id, design_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
          .run(randomUUID(), designId, 'user', prompt, now)
      }
      this.database.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, projectId)
    })
    return this.requireDesign(designId)
  }

  public addPrompt(designId: string, prompt: string): void {
    const now = new Date().toISOString()
    this.transaction(() => {
      this.database.prepare('INSERT INTO messages (id, design_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), designId, 'user', prompt, now)
      this.database.prepare('UPDATE designs SET updated_at = ? WHERE id = ?').run(now, designId)
    })
  }

  public reconnectProject(projectId: string, sourcePath: string): ProjectSummary {
    if (!existsSync(sourcePath)) throw new Error('The selected source folder is unavailable.')
    const existing = this.findProjectBySourcePath(sourcePath)
    if (existing && existing !== projectId) throw new Error('That folder is already linked to another OmniDesign project.')
    const result = this.database.prepare(`
      UPDATE projects SET source_path = ?, kind = 'linked', updated_at = ?
      WHERE id = ? AND trashed_at IS NULL
    `).run(sourcePath, new Date().toISOString(), projectId)
    if (result.changes !== 1) throw new Error('Project not found.')
    return this.getProjectSummary(projectId)!
  }

  public convertProjectToStandalone(projectId: string): ProjectSummary {
    const result = this.database.prepare(`
      UPDATE projects SET source_path = NULL, kind = 'standalone', updated_at = ?
      WHERE id = ? AND trashed_at IS NULL
    `).run(new Date().toISOString(), projectId)
    if (result.changes !== 1) throw new Error('Project not found.')
    return this.getProjectSummary(projectId)!
  }

  public moveProjectToTrash(projectId: string): void {
    const now = new Date().toISOString()
    this.transaction(() => {
      const project = this.database.prepare('SELECT id FROM projects WHERE id = ? AND trashed_at IS NULL').get(projectId)
      if (!project) throw new Error('Project not found.')
      this.database.prepare('UPDATE projects SET trashed_at = ? WHERE id = ?').run(now, projectId)
      this.database.prepare('UPDATE designs SET trashed_at = ? WHERE project_id = ? AND trashed_at IS NULL').run(now, projectId)
    })
  }

  public moveDesignToTrash(designId: string): void {
    const result = this.database.prepare('UPDATE designs SET trashed_at = ? WHERE id = ? AND trashed_at IS NULL').run(new Date().toISOString(), designId)
    if (result.changes !== 1) throw new Error('Design not found.')
  }

  public listTrash(): TrashItem[] {
    const rows = this.database.prepare(`
      SELECT p.id, 'project' AS kind, p.name, NULL AS project_id, NULL AS project_name, p.source_path, p.trashed_at
      FROM projects p WHERE p.trashed_at IS NOT NULL
      UNION ALL
      SELECT d.id, 'design' AS kind, d.title AS name, d.project_id, p.name AS project_name, p.source_path, d.trashed_at
      FROM designs d JOIN projects p ON p.id = d.project_id
      WHERE d.trashed_at IS NOT NULL AND p.trashed_at IS NULL
      ORDER BY trashed_at DESC
    `).all() as unknown as TrashRow[]
    const retentionMs = 30 * 24 * 60 * 60 * 1_000
    return rows.map((row) => ({
      id: row.id, kind: row.kind, name: row.name, projectId: row.project_id, projectName: row.project_name,
      sourceProjectPath: row.source_path, trashedAt: row.trashed_at,
      purgeAt: new Date(new Date(row.trashed_at).getTime() + retentionMs).toISOString(),
    }))
  }

  public restoreProject(projectId: string): ProjectSummary {
    this.transaction(() => {
      const project = this.database.prepare('SELECT id FROM projects WHERE id = ? AND trashed_at IS NOT NULL').get(projectId)
      if (!project) throw new Error('Trashed project not found.')
      this.database.prepare('UPDATE projects SET trashed_at = NULL, updated_at = ? WHERE id = ?').run(new Date().toISOString(), projectId)
      this.database.prepare('UPDATE designs SET trashed_at = NULL WHERE project_id = ?').run(projectId)
    })
    return this.getProjectSummary(projectId)!
  }

  public restoreDesign(designId: string): Design {
    const result = this.database.prepare(`
      UPDATE designs SET trashed_at = NULL WHERE id = ? AND trashed_at IS NOT NULL
        AND EXISTS (SELECT 1 FROM projects p WHERE p.id = designs.project_id AND p.trashed_at IS NULL)
    `).run(designId)
    if (result.changes !== 1) throw new Error('Restore the containing project before restoring this design.')
    return this.requireDesign(designId)
  }

  public purgeTrashItem(kind: 'project' | 'design', id: string): void {
    if (kind === 'project') {
      const project = this.database.prepare('SELECT id FROM projects WHERE id = ? AND trashed_at IS NOT NULL').get(id) as { id: string } | undefined
      if (!project) throw new Error('Trashed project not found.')
      const designIds = (this.database.prepare('SELECT id FROM designs WHERE project_id = ?').all(id) as { id: string }[]).map((row) => row.id)
      this.database.prepare('DELETE FROM projects WHERE id = ?').run(id)
      designIds.forEach((designId) => this.removeDesignArtifacts(designId))
      return
    }
    const design = this.database.prepare('SELECT id FROM designs WHERE id = ? AND trashed_at IS NOT NULL').get(id) as { id: string } | undefined
    if (!design) throw new Error('Trashed design not found.')
    this.database.prepare('DELETE FROM designs WHERE id = ?').run(id)
    this.removeDesignArtifacts(id)
  }

  public addAssistantResponse(designId: string, response: string): Design {
    const now = new Date().toISOString()
    this.transaction(() => {
      this.requireDesign(designId)
      this.database.prepare('INSERT INTO messages (id, design_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), designId, 'assistant', response, now)
      this.database.prepare('UPDATE designs SET updated_at = ? WHERE id = ?').run(now, designId)
    })
    return this.requireDesign(designId)
  }

  public addRevision(
    designId: string,
    prompt: string,
    providerId = 'mock',
    modelId = 'mock-v1',
    gitCommit: string | null = null,
    assistantResponse = 'Generated and validated a new design revision.',
  ): Design {
    const design = this.requireDesign(designId)
    const revisionId = randomUUID()
    const now = new Date().toISOString()

    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO revisions (id, design_id, parent_revision_id, prompt, provider_id, model_id, git_commit, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(revisionId, designId, design.activeRevisionId, prompt, providerId, modelId, gitCommit, now)
      this.database.prepare('INSERT INTO messages (id, design_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), designId, 'assistant', assistantResponse, now)
      this.database.prepare('UPDATE designs SET active_revision_id = ?, selected_revision_id = ?, updated_at = ?, draft = ? WHERE id = ?')
        .run(revisionId, revisionId, now, '', designId)
      this.database.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now, design.projectId)
    })

    return this.requireDesign(designId)
  }

  public selectRevision(designId: string, revisionId: string): Design {
    this.requireRevision(designId, revisionId)
    this.database.prepare('UPDATE designs SET selected_revision_id = ? WHERE id = ?').run(revisionId, designId)
    return this.requireDesign(designId)
  }

  public restoreRevision(designId: string, revisionId: string, gitCommit: string | null = null): Design {
    const revision = this.requireRevision(designId, revisionId)
    return this.addRevision(designId, `Restored: ${revision.prompt}`, revision.providerId, revision.modelId, gitCommit)
  }

  public saveDraft(designId: string, draft: string): void {
    const result = this.database.prepare('UPDATE designs SET draft = ? WHERE id = ?').run(draft, designId)
    if (result.changes !== 1) throw new Error('Design not found.')
  }

  public saveLayout(designId: string, layout: Layout): void {
    const result = this.database.prepare('UPDATE designs SET layout_json = ? WHERE id = ?').run(JSON.stringify(layout), designId)
    if (result.changes !== 1) throw new Error('Design not found.')
  }

  public getTheme(): Theme {
    const setting = this.database.prepare("SELECT value FROM settings WHERE key = 'theme'").get() as { value: string } | undefined
    return themeSchema.catch('dark').parse(setting?.value)
  }

  public saveTheme(theme: Theme): void {
    this.database.prepare(`
      INSERT INTO settings (key, value) VALUES ('theme', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(theme)
  }

  public getGenerationDefaults(): GenerationSelection {
    const setting = this.database.prepare("SELECT value FROM settings WHERE key = 'generation.defaults'").get() as { value: string } | undefined
    if (!setting) return { providerId: 'mock', modelId: 'mock-v1', effort: null }
    return generationSelectionSchema.catch({ providerId: 'mock', modelId: 'mock-v1', effort: null }).parse(safeParseJson(setting.value))
  }

  public saveGenerationDefaults(selection: GenerationSelection): void {
    this.database.prepare(`
      INSERT INTO settings (key, value) VALUES ('generation.defaults', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(JSON.stringify(generationSelectionSchema.parse(selection)))
  }

  public saveDesignSelection(designId: string, selection: GenerationSelection): void {
    const parsed = generationSelectionSchema.parse(selection)
    const result = this.database.prepare('UPDATE designs SET last_provider_id = ?, last_model_id = ?, last_effort = ? WHERE id = ?')
      .run(parsed.providerId, parsed.modelId, parsed.effort, designId)
    if (result.changes !== 1) throw new Error('Design not found.')
  }

  public addGenerationStep(designId: string, stage: string, label: string, detail: string | null = null, jobId: string | null = null): void {
    this.database.prepare(`
      INSERT INTO generation_steps (id, design_id, job_id, stage, label, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), designId, jobId, stage, label, detail, new Date().toISOString())
  }

  public enqueueGenerationJob(designId: string, prompt: string, providerId: 'mock' | 'codex' | 'claude' = 'mock', modelId = 'mock-v1', effort?: string | null): GenerationJob {
    this.requireDesign(designId)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO generation_jobs (id, design_id, prompt, provider_id, model_id, effort, state, created_at, started_at, completed_at, error)
        VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, NULL, NULL, NULL)
      `).run(id, designId, prompt, providerId, modelId, effort ?? null, now)
      this.database.prepare('INSERT INTO messages (id, design_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), designId, 'user', prompt, now)
      this.database.prepare('UPDATE designs SET updated_at = ? WHERE id = ?').run(now, designId)
    })
    return this.requireGenerationJob(id)
  }

  public listGenerationJobs(states: readonly GenerationJobState[] = ['queued']): GenerationJob[] {
    if (!states.length) return []
    const placeholders = states.map(() => '?').join(', ')
    const rows = this.database.prepare(`
      SELECT id, design_id, prompt, provider_id, model_id, effort, state, created_at, started_at, completed_at, error
      FROM generation_jobs WHERE state IN (${placeholders}) ORDER BY created_at, rowid
    `).all(...states) as unknown as GenerationJobRow[]
    return rows.map((row) => this.hydrateGenerationJob(row))
  }

  public getGenerationJob(id: string): GenerationJob | null {
    const row = this.database.prepare(`
      SELECT id, design_id, prompt, provider_id, model_id, effort, state, created_at, started_at, completed_at, error
      FROM generation_jobs WHERE id = ?
    `).get(id) as unknown as GenerationJobRow | undefined
    return row ? this.hydrateGenerationJob(row) : null
  }

  public setGenerationJobState(id: string, state: Exclude<GenerationJobState, 'queued'>, error: string | null = null): GenerationJob {
    const now = new Date().toISOString()
    const result = state === 'running'
      ? this.database.prepare("UPDATE generation_jobs SET state = ?, started_at = ?, completed_at = NULL, error = NULL WHERE id = ? AND state = 'queued'").run(state, now, id)
      : this.database.prepare('UPDATE generation_jobs SET state = ?, completed_at = ?, error = ? WHERE id = ? AND state = \'running\'').run(state, now, error, id)
    if (result.changes !== 1) throw new Error('Generation job is not in a state that can be updated.')
    return this.requireGenerationJob(id)
  }

  public cancelQueuedGenerationJob(id: string): GenerationJob {
    const now = new Date().toISOString()
    const result = this.database.prepare("UPDATE generation_jobs SET state = 'cancelled', completed_at = ?, error = 'Cancelled by the user.' WHERE id = ? AND state = 'queued'")
      .run(now, id)
    if (result.changes !== 1) throw new Error('Generation job is not queued.')
    return this.requireGenerationJob(id)
  }

  public retryGenerationJob(id: string): GenerationJob {
    const previous = this.requireGenerationJob(id)
    if (!['failed', 'cancelled', 'interrupted'].includes(previous.state)) throw new Error('Only stopped generation jobs can be retried.')
    const retryId = randomUUID()
    this.database.prepare(`
      INSERT INTO generation_jobs (id, design_id, prompt, provider_id, model_id, effort, state, created_at, started_at, completed_at, error)
      VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, NULL, NULL, NULL)
    `).run(retryId, previous.designId, previous.prompt, previous.providerId, previous.modelId, previous.effort ?? null, previous.createdAt)
    return this.requireGenerationJob(retryId)
  }

  public markGenerationJobsInterrupted(): GenerationJob[] {
    const now = new Date().toISOString()
    this.database.prepare("UPDATE generation_jobs SET state = 'interrupted', completed_at = ?, error = 'OmniDesign closed before this generation completed.' WHERE state IN ('queued', 'running')")
      .run(now)
    return this.listGenerationJobs(['interrupted'])
  }

  public pauseGenerationQueue(designId: string): void {
    const result = this.database.prepare('UPDATE designs SET queue_paused = 1 WHERE id = ?').run(designId)
    if (result.changes !== 1) throw new Error('Design not found.')
  }

  public resumeGenerationQueue(designId: string): void {
    const result = this.database.prepare('UPDATE designs SET queue_paused = 0 WHERE id = ?').run(designId)
    if (result.changes !== 1) throw new Error('Design not found.')
  }

  public listPausedGenerationDesignIds(): string[] {
    return (this.database.prepare('SELECT id FROM designs WHERE queue_paused = 1').all() as { id: string }[]).map((row) => row.id)
  }

  public addPreviewDiagnostic(designId: string, revisionId: string, diagnostic: Omit<PreviewDiagnostic, 'id' | 'createdAt'>): void {
    this.requireRevision(designId, revisionId)
    this.database.prepare(`
      INSERT INTO preview_diagnostics (id, revision_id, kind, level, message, source, line, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(randomUUID(), revisionId, diagnostic.kind, diagnostic.level, diagnostic.message, diagnostic.source, diagnostic.line, new Date().toISOString())
  }

  public saveThumbnail(designId: string, revisionId: string, png: Uint8Array): void {
    this.requireRevision(designId, revisionId)
    const thumbnailDirectory = path.join(this.artifactsDirectory, designId, 'thumbnails')
    mkdirSync(thumbnailDirectory, { recursive: true })
    const thumbnailPath = path.join(thumbnailDirectory, `${revisionId}.png`)
    writeFileSync(thumbnailPath, png)
    this.database.prepare(`
      INSERT INTO revision_thumbnails (revision_id, thumbnail_path) VALUES (?, ?)
      ON CONFLICT(revision_id) DO UPDATE SET thumbnail_path = excluded.thumbnail_path
    `).run(revisionId, thumbnailPath)
    if (this.requireDesign(designId).activeRevisionId === revisionId) {
      this.database.prepare('UPDATE designs SET thumbnail_path = ? WHERE id = ?').run(thumbnailPath, designId)
    }
  }

  public addInvalidCandidate(designId: string, prompt: string, html: string, diagnostic: string): Design {
    this.requireDesign(designId)
    const candidateId = randomUUID()
    const now = new Date().toISOString()
    const candidateDirectory = path.join(this.artifactsDirectory, designId, 'candidates', candidateId)
    mkdirSync(candidateDirectory, { recursive: true })
    const candidatePath = path.join(candidateDirectory, 'index.html')
    writeFileSync(candidatePath, html, { encoding: 'utf8', flag: 'wx' })

    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO invalid_candidates (id, design_id, prompt, candidate_path, diagnostic, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(candidateId, designId, prompt, candidatePath, diagnostic, now)
      this.database.prepare('INSERT INTO messages (id, design_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), designId, 'system', `Candidate rejected: ${diagnostic}`, now)
      this.database.prepare('UPDATE designs SET updated_at = ? WHERE id = ?').run(now, designId)
    })

    return this.requireDesign(designId)
  }

  private migrate(): void {
    this.database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;')
    const migrations = [migrationOne, migrationTwo, migrationThree, migrationFour, migrationFive, migrationSix, migrationSeven, migrationEight, migrationNine, migrationTen, migrationEleven, migrationTwelve, migrationThirteen, migrationFourteen, migrationFifteen, migrationSixteen, migrationSeventeen, migrationEighteen]
    // Foreign keys are disabled while migrating so table-rebuild migrations (rename/copy/drop of a
    // table other tables reference) can run; re-enabled and verified afterwards. The pragma is a no-op
    // inside a transaction, so it is toggled around the per-migration transactions, not within them.
    this.database.exec('PRAGMA foreign_keys = OFF')
    try {
      for (const [index, migration] of migrations.entries()) {
        const version = index + 1
        const applied = this.database.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version)
        if (applied) continue
        this.transaction(() => {
          this.database.exec(migration)
          this.database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
        })
      }
    } finally {
      this.database.exec('PRAGMA foreign_keys = ON')
    }
  }

  private hydrateDesign(row: DesignRow): Design {
    const messageRows = this.database.prepare('SELECT id, role, text, created_at FROM messages WHERE design_id = ? ORDER BY created_at, rowid')
      .all(row.id) as unknown as MessageRow[]
    const revisionRows = this.database.prepare(`
      SELECT id, parent_revision_id, prompt, provider_id, model_id, git_commit, created_at
      FROM revisions WHERE design_id = ? ORDER BY created_at, rowid
    `).all(row.id) as unknown as RevisionRow[]
    const invalidCandidateRows = this.database.prepare(`
      SELECT id, prompt, candidate_path, diagnostic, created_at
      FROM invalid_candidates WHERE design_id = ? ORDER BY created_at, rowid
    `).all(row.id) as unknown as InvalidCandidateRow[]

    return designSchema.parse({
      id: row.id,
      projectId: row.project_id,
      projectName: row.project_name,
      sourceProjectPath: row.source_path,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activeRevisionId: row.active_revision_id,
      selectedRevisionId: row.selected_revision_id,
      draft: row.draft,
      thumbnailDataUrl: row.thumbnail_path && existsSync(row.thumbnail_path) ? `data:image/png;base64,${readFileSync(row.thumbnail_path).toString('base64')}` : null,
      queuePaused: row.queue_paused === 1,
      lastSelection: {
        providerId: row.last_provider_id,
        modelId: row.last_model_id,
        effort: row.last_effort,
      },
      generationSteps: this.listGenerationStepsForDesign(row.id),
      layout: layoutSchema.parse(JSON.parse(row.layout_json)),
      messages: messageRows.map((message) => ({ id: message.id, role: message.role, text: message.text, createdAt: message.created_at })),
      invalidCandidates: invalidCandidateRows.map((candidate): InvalidCandidate => ({
        id: candidate.id,
        prompt: candidate.prompt,
        html: readFileSync(candidate.candidate_path, 'utf8'),
        diagnostic: candidate.diagnostic,
        createdAt: candidate.created_at,
      })),
      generationJobs: this.listGenerationJobsForDesign(row.id),
      revisions: revisionRows.map((revision): Revision => ({
        id: revision.id,
        parentRevisionId: revision.parent_revision_id,
        prompt: revision.prompt,
        providerId: revision.provider_id,
        modelId: revision.model_id,
        gitCommit: revision.git_commit,
        createdAt: revision.created_at,
        thumbnailDataUrl: this.readThumbnailDataUrl(this.database.prepare('SELECT thumbnail_path FROM revision_thumbnails WHERE revision_id = ?').get(revision.id) as { thumbnail_path: string } | undefined),
        diagnostics: this.database.prepare(`
          SELECT id, kind, level, message, source, line, created_at
          FROM preview_diagnostics WHERE revision_id = ? ORDER BY created_at, rowid
        `).all(revision.id).map((diagnostic) => {
          const row = diagnostic as unknown as PreviewDiagnosticRow
          return { id: row.id, kind: row.kind, level: row.level, message: row.message, source: row.source, line: row.line, createdAt: row.created_at }
        }),
      })),
    })
  }

  private hydrateProject(row: ProjectRow): ProjectSummary {
    const latest = this.database.prepare(`
      SELECT d.title, d.thumbnail_path,
             (SELECT m.text FROM messages m WHERE m.design_id = d.id AND m.role = 'user' ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1) AS latest_prompt
      FROM designs d WHERE d.project_id = ? ORDER BY d.updated_at DESC, d.rowid DESC LIMIT 1
    `).get(row.id) as { title: string; thumbnail_path: string | null; latest_prompt: string | null } | undefined
    return projectSummarySchema.parse({
      id: row.id,
      name: row.name,
      kind: row.kind,
      sourceProjectPath: row.source_path,
      sourceAvailable: row.kind === 'linked' ? row.source_path !== null && existsSync(row.source_path) : true,
      designCount: row.design_count,
      createdAt: row.created_at,
      updatedAt: row.last_design_activity ?? row.updated_at,
      thumbnailDataUrl: latest?.thumbnail_path && existsSync(latest.thumbnail_path) ? `data:image/png;base64,${readFileSync(latest.thumbnail_path).toString('base64')}` : null,
      latestDesignTitle: latest?.title ?? null,
      latestPrompt: latest?.latest_prompt ?? null,
    })
  }

  private requireDesign(designId: string): Design {
    const design = this.getDesign(designId)
    if (!design) throw new Error('Design not found.')
    return design
  }

  private readThumbnailDataUrl(thumbnail: { thumbnail_path: string } | undefined): string | null {
    return thumbnail && existsSync(thumbnail.thumbnail_path) ? `data:image/png;base64,${readFileSync(thumbnail.thumbnail_path).toString('base64')}` : null
  }

  private requireRevision(designId: string, revisionId: string): Revision {
    const revision = this.requireDesign(designId).revisions.find((candidate) => candidate.id === revisionId)
    if (!revision) throw new Error('Revision not found.')
    return revision
  }

  private requireGenerationJob(id: string): GenerationJob {
    const job = this.getGenerationJob(id)
    if (!job) throw new Error('Generation job not found.')
    return job
  }

  private listGenerationStepsForDesign(designId: string): GenerationStep[] {
    const rows = this.database.prepare(`
      SELECT id, stage, label, detail, created_at
      FROM generation_steps WHERE design_id = ? ORDER BY created_at, rowid
    `).all(designId) as unknown as GenerationStepRow[]
    return rows.map((row) => ({ id: row.id, stage: row.stage, label: row.label, detail: row.detail, createdAt: row.created_at }))
  }

  private listGenerationJobsForDesign(designId: string): GenerationJob[] {
    const rows = this.database.prepare(`
      SELECT id, design_id, prompt, provider_id, model_id, effort, state, created_at, started_at, completed_at, error
      FROM generation_jobs WHERE design_id = ? ORDER BY created_at, rowid
    `).all(designId) as unknown as GenerationJobRow[]
    return rows.map((row) => this.hydrateGenerationJob(row))
  }

  private hydrateGenerationJob(row: GenerationJobRow): GenerationJob {
    return generationJobSchema.parse({
      id: row.id,
      designId: row.design_id,
      prompt: row.prompt,
      providerId: row.provider_id,
      modelId: row.model_id,
      effort: row.effort,
      state: row.state,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
    })
  }

  private purgeExpiredTrash(): void {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000).toISOString()
    const expired = this.database.prepare(`
      SELECT id, 'project' AS kind FROM projects WHERE trashed_at IS NOT NULL AND trashed_at <= ?
      UNION ALL
      SELECT d.id, 'design' AS kind FROM designs d JOIN projects p ON p.id = d.project_id
      WHERE d.trashed_at IS NOT NULL AND p.trashed_at IS NULL AND d.trashed_at <= ?
    `).all(cutoff, cutoff) as { id: string; kind: 'project' | 'design' }[]
    expired.forEach((item) => this.purgeTrashItem(item.kind, item.id))
  }

  private removeDesignArtifacts(designId: string): void {
    const target = path.resolve(this.artifactsDirectory, designId)
    const root = path.resolve(this.artifactsDirectory)
    if (path.dirname(target) !== root) throw new Error('Refusing to remove an unexpected design artifact path.')
    rmSync(target, { recursive: true, force: true })
  }

  private transaction(work: () => void): void {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      work()
      this.database.exec('COMMIT')
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }
}
