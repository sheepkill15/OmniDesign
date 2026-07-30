# Installed-Subscription Provider Pilot

## Status

This is a narrow implementation pilot. It is not the completed Phase 1 provider system and does not supersede the provider contract in `ARCHITECTURE.md` or the requirements in `docs/PHASE_1_SPEC.md`.

## Included

- Route discovery, prompts, replies, and streamed activity through one provider-neutral adapter contract. Electron and IPC callers never branch on Codex-versus-Claude behavior; built-in adapters own those differences and future providers can join the registry through the same interface.
- Detect the locally installed Codex and Claude Code CLIs from Electron's main process.
- Resolve the real executable or Windows command shim before launching a provider. The Codex Desktop-bundled executable is not treated as an installed Codex CLI because it is not an externally supported app-server entry point.
- Reuse their existing sign-in state; OmniDesign stores no API keys or credentials.
- Ask Codex App Server for the account and live model catalogue.
- Ask Claude Code for its version and authenticated status. Claude Code does not expose a comparable subscription model-list endpoint, so OmniDesign derives the current model aliases advertised by the installed CLI rather than maintaining a static catalogue.
- Derive selectable effort levels from Codex model capabilities and Claude Code's installed CLI help. Leaving effort on Provider default omits an override.
- Normalize the activity common to both providers as status, text, tool, result, and diagnostic events. Provider-specific and unrecognized protocol messages remain inside their adapters and are not exposed to the application.
- Send a plain text prompt to one selected provider/model and present its response in the trusted renderer.
- Cache validated non-secret provider availability, model, and effort metadata in application-local SQLite. Launch reads the cache immediately, starts one de-duplicated discovery refresh in the main process, and publishes the refreshed result to the renderer without exposing provider processes or credentials.
- Guide unavailable or signed-out providers through the required vendor CLI: Codex uses the Codex CLI and Claude uses the Claude Code CLI. The trusted UI shows platform-appropriate commands, opens only an allow-listed official setup page through main-process IPC, and refreshes discovery after the user finishes the provider-owned installation and sign-in flow.

## Safety boundary

The renderer receives only cached-status reads, explicit status refresh, refresh notifications, and prompt IPC operations. It cannot access a shell, the filesystem, a provider process, or credentials. Cached status contains capability metadata only, never sign-in tokens or other secrets. The initial Codex turn uses read-only sandboxing and no approvals; the initial Claude prompt uses plan permission mode.

## Deliberately deferred

- API-key configuration, multiple accounts, automated provider installation/update management, attachments, project-context access, conversation persistence, cancellation, retries, and design generation orchestration. Guided CLI setup is in scope, but OmniDesign does not run installers or handle provider credentials.
- Claude's exact subscription-entitled model discovery, if and when Claude Code exposes a stable supported mechanism.
- Moving these prototype contracts into the planned provider-contract package after the walking skeleton establishes the package boundaries.

## Target Agent Harness Contract

The next provider-generation integration does not ask a model to return a complete HTML document. OmniDesign creates a self-contained Git repository for each design and prepares its `index.html` before the provider agent starts. The provider harness runs the agent in that repository, where it can work normally on the design files.

For an existing-project design, the harness supplies the original project as a separate provider-visible reference root: Codex receives it through `runtimeWorkspaceRoots`, and Claude Code receives it through `--add-dir`. The original project is not the agent workspace. Phase 1 instructions require it to be treated as read-only, but enforceable external write denial remains an explicit unresolved security gap.

OmniDesign reads Git state to determine whether the design changed and creates revisions from that state. The agent does not list changed files and does not choose or report an entry point. After it finishes, it returns a validated JSON completion payload with a `response` field for its conversational reply to the user. A response may be returned without design changes or a new revision. OmniDesign builds the completion record from independent evidence: harness and validation tooling supply validation results and diagnostics, while the provider adapter supplies usage and cost when available. File inventory and entry-point fields are explicitly out of scope.
