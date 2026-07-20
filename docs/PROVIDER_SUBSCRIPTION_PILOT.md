# Installed-Subscription Provider Pilot

## Status

This is a narrow implementation pilot. It is not the completed Phase 1 provider system and does not supersede the provider contract in `ARCHITECTURE.md` or the requirements in `docs/PHASE_1_SPEC.md`.

## Included

- Detect the locally installed Codex and Claude Code CLIs from Electron's main process.
- Resolve the real executable or Windows command shim before launching a provider. The Codex Desktop-bundled executable is not treated as an installed Codex CLI because it is not an externally supported app-server entry point.
- Reuse their existing sign-in state; OmniDesign stores no API keys or credentials.
- Ask Codex App Server for the account and live model catalogue.
- Ask Claude Code for its version and authenticated status. Claude Code does not expose a comparable subscription model-list endpoint, so OmniDesign derives the current model aliases advertised by the installed CLI rather than maintaining a static catalogue.
- Send a plain text prompt to one selected provider/model and present its response in the trusted renderer.

## Safety boundary

The renderer receives only `discover` and `prompt` IPC operations. It cannot access a shell, the filesystem, a provider process, or credentials. The initial Codex turn uses read-only sandboxing and no approvals; the initial Claude prompt uses plan permission mode.

## Deliberately deferred

- API-key configuration, multiple accounts, provider settings, refresh/update actions, attachments, project-context access, conversation persistence, streaming UI, cancellation, retries, usage reporting, and design generation orchestration.
- Claude's exact subscription-entitled model discovery, if and when Claude Code exposes a stable supported mechanism.
- Moving these prototype contracts into the planned provider-contract package after the walking skeleton establishes the package boundaries.
