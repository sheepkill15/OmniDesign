# OmniDesign

The desktop application currently implements the accepted Phase 1 home design baseline. See `docs/HOME_DESIGN_BASELINE.md` for the composition and interaction rules that subsequent screens must follow.

## Development

Install dependencies and start the application:

```powershell
pnpm install
pnpm dev
```

Run the automated check and production build:

```powershell
pnpm test
pnpm run typecheck
pnpm run build
```

## CI/CD

Pull requests run typechecking, unit and component tests, a production build,
and the Electron end-to-end suite through GitHub Actions. Every push to `main`
that passes the release checks produces a Windows x64 installer and separate
Apple Silicon and Intel macOS disk images, then publishes them as a versioned
GitHub Release consumed by the packaged application's automatic updater.

See [`docs/CI_CD.md`](docs/CI_CD.md) for artifact names, branch-protection
settings, release secrets, and local packaging commands.
