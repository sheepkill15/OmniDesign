# GitHub CI/CD

OmniDesign uses two GitHub Actions workflows:

- `CI` runs for every pull request. It typechecks, runs the unit and component
  suite, builds the application, and runs the Electron end-to-end suite on
  Windows.
- `CD` runs for every push to `main`. It repeats the release-candidate checks,
  then packages native installers on GitHub-hosted Windows and macOS runners.

## Delivery artifacts

Every successful `CD` run uploads these artifacts for 30 days:

| Artifact | Contents |
| --- | --- |
| `omnidesign-windows-x64` | Unsigned Windows x64 NSIS installer (`.exe`) |
| `omnidesign-macos-arm64` | Unsigned Apple Silicon disk image (`.dmg`) |
| `omnidesign-macos-x64` | Unsigned Intel macOS disk image (`.dmg`) |

The split macOS builds are intentional. OmniDesign's Tailwind compiler includes
a platform-native dependency, so native Intel and Apple Silicon packages avoid
unsafe universal-binary assumptions.

The unit suite uses a 10-second per-test ceiling. This preserves a bounded test
run while allowing Git-backed workspace integration tests to complete under
shared CI-runner load.

These artifacts are continuous-delivery outputs, not permanent GitHub Releases.
The application is still versioned `0.0.0`, and distribution signing,
notarization, release versioning, and auto-update channels have not yet been
defined.

Unsigned packages are suitable for internal testing, but operating systems warn
users about them. Public distribution requires a Windows code-signing
certificate and an Apple Developer ID certificate plus notarization credentials.
Credentials must be stored as GitHub Actions secrets and never committed.

## Recommended repository settings

Protect `main` in GitHub and require a pull request plus these status checks:

- `Quality`
- `Electron E2E (Windows)`

Also block force pushes and branch deletion. With those settings, every merged
change has passed CI before the `CD` workflow packages it.

## Local packaging

Use the command for the current host platform:

```powershell
pnpm package:win
pnpm package:mac:arm64
pnpm package:mac:x64
```

The macOS commands must run on macOS. Generated installers are written to
`release/`, which is ignored by Git.
