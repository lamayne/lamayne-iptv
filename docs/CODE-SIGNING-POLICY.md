# Code signing policy

> **Status: SignPath Foundation application pending.** Only keep the sentence "Free code signing provided by SignPath.io…"
> once the application has been accepted.

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

## What is signed

The LAMAYNE IPTV Windows installers published on the *Releases* page of this repository
(`LAMAYNE-IPTV_<version>_x64-setup.exe` and `…-setup-offline.exe`).
They are built automatically by GitHub Actions (`.github/workflows/release.yml`) from the code in this repository,
on GitHub-hosted machines.

## Roles

- **Owner, reviewer and approver**: the repository owner (see `.github/CODEOWNERS`).
  Every signing request is approved manually, after checking the version and the build log.
- The signing rules (`.signpath/`) and the workflows can only be modified by the owner.

## Privacy

The application collects no data and sends nothing to its author. It only contacts the servers it needs to work: the user's
IPTV provider, the image hosts the provider indicates, the public programme-guide service epg.pw (country code only) and,
when the user asks for it, Google devices on the user's local network.
Details: [PRIVACY.md](../PRIVACY.md).

## Reporting

For a problem related to a signed binary (antivirus false positive, unexpected behaviour), open an issue or, for security
matters, follow [SECURITY.md](../SECURITY.md).
