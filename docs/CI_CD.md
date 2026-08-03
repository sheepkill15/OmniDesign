# GitHub CI/CD

OmniDesign uses two GitHub Actions workflows:

- `CI` runs for every pull request. It typechecks, runs the unit and component
  suite, builds the application, and runs the Electron end-to-end suite on
  Windows.
- `CD` runs for every push to `main`. It repeats the release-candidate checks,
  packages native installers on GitHub-hosted Windows and macOS runners, and
  publishes one versioned GitHub Release for the desktop updater.

## Delivery artifacts

Every successful `CD` run uploads these artifacts for 30 days:

| Artifact | Contents |
| --- | --- |
| `omnidesign-windows-x64` | Windows x64 NSIS installer, blockmap, and update metadata |
| `omnidesign-macos-arm64` | Apple Silicon DMG, update ZIP, blockmaps, and metadata |
| `omnidesign-macos-x64` | Intel macOS DMG, update ZIP, blockmaps, and metadata |

The split macOS builds are intentional. OmniDesign's Tailwind compiler includes
a platform-native dependency, so native Intel and Apple Silicon packages avoid
unsafe universal-binary assumptions.

The unit suite uses a 10-second per-test ceiling. This preserves a bounded test
run while allowing Git-backed workspace integration tests to complete under
shared CI-runner load.

Each run derives version `0.0.<workflow run number>`, merges the two native macOS
metadata documents into one architecture-aware `latest-mac.yml`, and publishes
all payloads under a `v0.0.<workflow run number>` GitHub Release. The packaged
Windows application checks the repository's latest release on startup, downloads
a newer version, and asks whether to restart. Choosing Later retains the download
and installs it on the next ordinary quit. macOS automatic updates remain disabled
while its packages are unsigned.

## Unsigned macOS stage

OmniDesign does not currently have an Apple Developer account. Both macOS CD jobs
therefore package with explicit electron-builder overrides:

- `mac.identity=null`
- `mac.hardenedRuntime=false`
- `mac.notarize=false`

The jobs do not receive Apple signing secrets, and GitHub Release publication does
not require them. The resulting DMG and ZIP files are unsigned, intended for manual
testing and early distribution, and may require approval through macOS System
Settings. Automatic updates are disabled on macOS because electron-updater requires
the application to be signed.

When an Apple Developer account becomes available, restoring signed/notarized CD
is an explicit delivery change: configure a Developer ID Application certificate,
notarization credentials, hardened runtime, and macOS updater coverage together.

## Windows release credentials

Windows signing is strongly recommended and is enabled automatically when these
optional secrets exist:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

The release job alone receives `contents: write`; CI and package jobs retain
read-only repository access. Certificates and passwords must never be committed.

Windows SmartScreen may warn until Windows signing is configured and publisher
reputation is established.

## Recommended repository settings

Protect `main` in GitHub and require a pull request plus these status checks:

- `Quality`
- `Electron E2E (Windows)`

Also block force pushes and branch deletion. With those settings, every merged
change has passed CI before the `CD` workflow packages it.

## Local packaging

Use this command on Windows:

```powershell
pnpm package:win
```

For an unsigned macOS package matching CD, use:

```bash
node scripts/package-macos.mjs package:mac:arm64 --unsigned
node scripts/package-macos.mjs package:mac:x64 --unsigned
```

The macOS commands must run on the matching macOS architecture. Generated
installers are written to `release/`, which is ignored by Git.
