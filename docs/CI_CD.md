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
all update payloads under a `v0.0.<workflow run number>` GitHub Release. The
public packaged application checks the repository's latest release on startup,
downloads a newer version, and asks whether to restart. Choosing Later retains
the download and installs it on the next ordinary quit.

## Release credentials

macOS auto-update requires a signed application and the ZIP update target. The
GitHub Release job therefore fails closed unless all of these repository secrets
exist:

- `MAC_CSC_LINK`: base64-encoded Developer ID Application `.p12` certificate
- `MAC_CSC_KEY_PASSWORD`: password for the `.p12`
- `APPLE_ID`: Apple developer account email
- `APPLE_APP_SPECIFIC_PASSWORD`: app-specific Apple password
- `APPLE_TEAM_ID`: Apple Developer team identifier

Windows signing is strongly recommended and is enabled automatically when these
optional secrets exist:

- `WIN_CSC_LINK`
- `WIN_CSC_KEY_PASSWORD`

The release job alone receives `contents: write`; CI and package jobs retain
read-only repository access. Certificates and passwords must never be committed.

Unsigned action artifacts remain available for internal inspection when release
credentials are missing, but no GitHub update release is published. Windows
SmartScreen may warn until Windows signing is configured and publisher
reputation is established.

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
