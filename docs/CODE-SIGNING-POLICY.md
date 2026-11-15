# Code signing policy

> **Status: application to SignPath Foundation not accepted yet.** The installers are not signed today.
> Add the sentence below to this page, to the README and to the release pages **only once the project is accepted**:
>
> ```
> Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org)
> ```

## What is signed

The Windows installers of LAMAYNE IPTV published on the [Releases](https://github.com/lamayne/lamayne-iptv/releases) page
(`LAMAYNE-IPTV_<version>_x64-setup.exe`).

They are built automatically by GitHub Actions ([`.github/workflows/release.yml`](../.github/workflows/release.yml)) from the
source code of this repository, on GitHub-hosted machines. Only binaries built from this project's own source code are signed.
The open source libraries bundled in the installer (listed in [THIRD-PARTY-NOTICES.md](../THIRD-PARTY-NOTICES.md)) are
unmodified upstream binaries and are not signed by this project.

## Team roles and members

- **Authors** (may change the source code without another review): [lamayne](https://github.com/lamayne)
- **Reviewers** (review every change proposed by anyone who is not an author, such as a pull request): [lamayne](https://github.com/lamayne)
- **Approvers** (approve each signing request, after checking the version and the build log): [lamayne](https://github.com/lamayne)

The project has a single maintainer. Every member uses multi-factor authentication on GitHub and on SignPath.
The signing rules (`.signpath/`) and the workflows can only be changed by the repository owner
(see [`.github/CODEOWNERS`](../.github/CODEOWNERS)).

## Privacy policy

See [PRIVACY.md](../PRIVACY.md). In short: the application collects no usage data and has no server of its own. It only contacts
the IPTV provider added by the user, the image hosts that provider indicates, the public programme-guide service epg.pw (a country
code only), Wikidata when the user clicks an actor's name, and Google devices on the local network when the user uses "Cast".

## Checking a download

Each release shows the SHA-256 of the installer, and attaches `SHA256SUMS.txt`. In PowerShell:

```powershell
Get-FileHash .\LAMAYNE-IPTV_<version>_x64-setup.exe -Algorithm SHA256
```

## Reporting a problem

An issue with a signed binary (antivirus false positive, unexpected behaviour): open an
[issue](https://github.com/lamayne/lamayne-iptv/issues), or, for security, follow [SECURITY.md](../SECURITY.md).
