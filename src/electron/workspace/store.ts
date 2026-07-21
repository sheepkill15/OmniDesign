import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { designSchema, generationJobSchema, layoutSchema, themeSchema } from './contracts.js'
import type { Design, GenerationJob, GenerationJobState, InvalidCandidate, Layout, Message, PreviewDiagnostic, Revision, Theme } from './contracts.js'

interface DesignRow {
  id: string
  project_id: string
  project_name: string
  title: string
  created_at: string
  updated_at: string
  active_revision_id: string | null
  selected_revision_id: string | null
  draft: string
  layout_json: string
  thumbnail_path: string | null
}

interface RevisionRow {
  id: string
  parent_revision_id: string | null
  prompt: string
  provider_id: string
  model_id: string
  created_at: string
  html_path: string
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
  state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'completed', 'failed', 'interrupted')),
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error TEXT
) STRICT;
CREATE INDEX generation_jobs_by_design ON generation_jobs(design_id, created_at);
CREATE INDEX generation_jobs_by_state ON generation_jobs(state, created_at);
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
  }

  public close(): void {
    this.database.close()
  }

  public listDesigns(): Design[] {
    const rows = this.database.prepare(`
      SELECT d.id, d.project_id, p.name AS project_name, d.title, d.created_at, d.updated_at,
             d.active_revision_id, d.selected_revision_id, d.draft, d.layout_json, d.thumbnail_path
      FROM designs d JOIN projects p ON p.id = d.project_id
      ORDER BY d.updated_at DESC
    `).all() as unknown as DesignRow[]
    return rows.map((row) => this.hydrateDesign(row))
  }

  public getDesign(designId: string): Design | null {
    const row = this.database.prepare(`
      SELECT d.id, d.project_id, p.name AS project_name, d.title, d.created_at, d.updated_at,
             d.active_revision_id, d.selected_revision_id, d.draft, d.layout_json, d.thumbnail_path
      FROM designs d JOIN projects p ON p.id = d.project_id WHERE d.id = ?
    `).get(designId) as unknown as DesignRow | undefined
    return row ? this.hydrateDesign(row) : null
  }

  public createStandaloneDesign(prompt: string, title: string): Design {
    const projectId = randomUUID()
    const designId = randomUUID()
    const messageId = randomUUID()
    const now = new Date().toISOString()

    this.transaction(() => {
      this.database.prepare('INSERT INTO projects (id, name, kind, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(projectId, title, 'standalone', now, now)
      this.database.prepare('INSERT INTO designs (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
        .run(designId, projectId, title, now, now)
      this.database.prepare('INSERT INTO messages (id, design_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(messageId, designId, 'user', prompt, now)
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

  public addRevision(designId: string, prompt: string, html: string, providerId = 'mock', modelId = 'mock-v1'): Design {
    const design = this.requireDesign(designId)
    const revisionId = randomUUID()
    const now = new Date().toISOString()
    const revisionDirectory = path.join(this.artifactsDirectory, designId, 'revisions', revisionId)
    mkdirSync(revisionDirectory, { recursive: true })
    const htmlPath = path.join(revisionDirectory, 'index.html')
    writeFileSync(htmlPath, html, { encoding: 'utf8', flag: 'wx' })

    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO revisions (id, design_id, parent_revision_id, prompt, provider_id, model_id, html_path, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(revisionId, designId, design.activeRevisionId, prompt, providerId, modelId, htmlPath, now)
      this.database.prepare('INSERT INTO messages (id, design_id, role, text, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(randomUUID(), designId, 'assistant', 'Generated and validated a new design revision.', now)
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

  public restoreRevision(designId: string, revisionId: string): Design {
    const revision = this.requireRevision(designId, revisionId)
    return this.addRevision(designId, `Restored: ${revision.prompt}`, revision.html)
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

  public enqueueGenerationJob(designId: string, prompt: string): GenerationJob {
    this.requireDesign(designId)
    const id = randomUUID()
    const now = new Date().toISOString()
    this.transaction(() => {
      this.database.prepare(`
        INSERT INTO generation_jobs (id, design_id, prompt, state, created_at, started_at, completed_at, error)
        VALUES (?, ?, ?, 'queued', ?, NULL, NULL, NULL)
      `).run(id, designId, prompt, now)
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
      SELECT id, design_id, prompt, state, created_at, started_at, completed_at, error
      FROM generation_jobs WHERE state IN (${placeholders}) ORDER BY created_at, rowid
    `).all(...states) as unknown as GenerationJobRow[]
    return rows.map((row) => this.hydrateGenerationJob(row))
  }

  public setGenerationJobState(id: string, state: Exclude<GenerationJobState, 'queued'>, error: string | null = null): GenerationJob {
    const now = new Date().toISOString()
    const result = state === 'running'
      ? this.database.prepare("UPDATE generation_jobs SET state = ?, started_at = ?, completed_at = NULL, error = NULL WHERE id = ? AND state = 'queued'").run(state, now, id)
      : this.database.prepare('UPDATE generation_jobs SET state = ?, completed_at = ?, error = ? WHERE id = ? AND state = \'running\'').run(state, now, error, id)
    if (result.changes !== 1) throw new Error('Generation job is not in a state that can be updated.')
    return this.requireGenerationJob(id)
  }

  public markGenerationJobsInterrupted(): GenerationJob[] {
    const now = new Date().toISOString()
    this.database.prepare("UPDATE generation_jobs SET state = 'interrupted', completed_at = ?, error = 'OmniDesign closed before this generation completed.' WHERE state IN ('queued', 'running')")
      .run(now)
    return this.listGenerationJobs(['interrupted'])
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
    const migrations = [migrationOne, migrationTwo, migrationThree, migrationFour, migrationFive, migrationSix, migrationSeven, migrationEight]
    for (const [index, migration] of migrations.entries()) {
      const version = index + 1
      const applied = this.database.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(version)
      if (applied) continue
      this.transaction(() => {
        this.database.exec(migration)
        this.database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
      })
    }
  }

  private hydrateDesign(row: DesignRow): Design {
    const messageRows = this.database.prepare('SELECT id, role, text, created_at FROM messages WHERE design_id = ? ORDER BY created_at, rowid')
      .all(row.id) as unknown as MessageRow[]
    const revisionRows = this.database.prepare(`
      SELECT id, parent_revision_id, prompt, provider_id, model_id, created_at, html_path
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
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      activeRevisionId: row.active_revision_id,
      selectedRevisionId: row.selected_revision_id,
      draft: row.draft,
      thumbnailDataUrl: row.thumbnail_path && existsSync(row.thumbnail_path) ? `data:image/png;base64,${readFileSync(row.thumbnail_path).toString('base64')}` : null,
      layout: layoutSchema.parse(JSON.parse(row.layout_json)),
      messages: messageRows.map((message) => ({ id: message.id, role: message.role, text: message.text, createdAt: message.created_at })),
      invalidCandidates: invalidCandidateRows.map((candidate): InvalidCandidate => ({
        id: candidate.id,
        prompt: candidate.prompt,
        html: readFileSync(candidate.candidate_path, 'utf8'),
        diagnostic: candidate.diagnostic,
        createdAt: candidate.created_at,
      })),
      revisions: revisionRows.map((revision): Revision => ({
        id: revision.id,
        parentRevisionId: revision.parent_revision_id,
        prompt: revision.prompt,
        providerId: revision.provider_id,
        modelId: revision.model_id,
        createdAt: revision.created_at,
        html: readFileSync(revision.html_path, 'utf8'),
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
    const row = this.database.prepare(`
      SELECT id, design_id, prompt, state, created_at, started_at, completed_at, error
      FROM generation_jobs WHERE id = ?
    `).get(id) as unknown as GenerationJobRow | undefined
    if (!row) throw new Error('Generation job not found.')
    return this.hydrateGenerationJob(row)
  }

  private hydrateGenerationJob(row: GenerationJobRow): GenerationJob {
    return generationJobSchema.parse({
      id: row.id,
      designId: row.design_id,
      prompt: row.prompt,
      state: row.state,
      createdAt: row.created_at,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      error: row.error,
    })
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
