# Publishing LAMAYNE IPTV: the complete path

This guide relies on SignPath, Tauri and Microsoft documentation consulted in October 2026.
Rules change: double-check the sensitive points when you get started.

**The path**: 1) prepare and test → 2) public GitHub repository → 3) free SignPath signing →
4) first release on GitHub → 5) (later) Microsoft Store, see [STORE-CHECKLIST.md](STORE-CHECKLIST.md).

---

## 1. Prepare and test (on your PC)

1. In the project folder:
   ```powershell
   Remove-Item package-lock.json -ErrorAction SilentlyContinue   # we use pnpm, not npm
   pnpm add -D vitest
   pnpm install
   pnpm typecheck
   pnpm test
   pnpm check:i18n
   ```
2. **Existing local data**: the application identifier changed from `nini22p.tauri-plugin-libmpv-example`
   to `com.lamayne.iptv`. Windows stores application data per identifier: without action, the profiles,
   favourites and history of **this PC** would start from scratch. To keep them, with the application **closed**:
   ```powershell
   $old = "$env:LOCALAPPDATA\nini22p.tauri-plugin-libmpv-example"
   $new = "$env:LOCALAPPDATA\com.lamayne.iptv"
   if ((Test-Path $old) -and -not (Test-Path $new)) { Rename-Item $old $new }
   $oldR = "$env:APPDATA\nini22p.tauri-plugin-libmpv-example"
   $newR = "$env:APPDATA\com.lamayne.iptv"
   if ((Test-Path $oldR) -and -not (Test-Path $newR)) { Rename-Item $oldR $newR }
   ```
   Your **IPTV accounts** (Windows Credential Manager) are migrated automatically: the old vault name is read as a
   fallback, then the accounts are moved to the new name on first access.
3. **Test a real build**, not just `pnpm tauri dev`: the Content Security Policy (CSP) is only applied in the
   compiled application.
   ```powershell
   pnpm tauri build
   ```
   Install `src-tauri\target\release\bundle\nsis\…-setup.exe`, then check: images and logos, playing a channel and
   a movie, search, Settings (language, programme guide), casting. If images or calls fail, run
   `pnpm tauri build --debug`: the developer console (F12) shows "Refused to …" with the rule to relax
   in `app.security.csp` of `src-tauri/tauri.conf.json`.
4. **Security**: change the IPTV password used during development (it appeared in `mpv.log`),
   delete `mpv.log` and make sure it was never committed.

To simulate a brand-new user, close the app and run `scripts/reset-local-data.ps1`.

## 2. Create the public GitHub repository

1. Create the repository (public) and enable **two-factor authentication** on your account (required by SignPath).
2. Upload the project (with Git, or through the web interface: see the note below), without `node_modules`, `dist`,
   `src-tauri/target`, `src-tauri/lib`, `src-tauri/gen`, logs and zip files.
3. Check the **Actions** tab: the **CI** workflow should turn green (ESLint style warnings do not block).
4. Repository Settings → **Rules → Rulesets**: protect the `main` branch (no deletion, no force-push).

> **Web upload note**: GitHub's browser upload accepts files up to 25 MB and about 100 files at a time. Drag whole
> folders (so paths are preserved) and upload `.github` last, so the CI does not run on an incomplete project.

## 3. Free signing: SignPath Foundation

**What it is.** SignPath Foundation provides a free code signing certificate to open source projects.
The certificate is issued to **SignPath Foundation** (it is the publisher shown by Windows): it verifies that the program
was built from your repository. You neither buy nor hold any certificate.

**Conditions** (signpath.org/terms): a recognised open source license (MIT qualifies), a public repository,
two-factor authentication for the whole team on GitHub and SignPath, a maintainer who approves every signature, and a
signing policy published in the repository ([CODE-SIGNING-POLICY.md](CODE-SIGNING-POLICY.md)). The application is
reviewed by SignPath: acceptance is not guaranteed.

**Steps**
1. On https://signpath.org, click **Apply**: provide the name, public repository URL, license, a short description
   (player for the user's own IPTV sources, no content provided) and your e-mail. Link the signing policy.
2. Once accepted, in the SignPath portal:
   - **Project slug**: `lamayne-iptv` (or adapt `project-slug` in `release.yml`);
   - **Artifact configuration**: paste the content of `.signpath/artifact-configuration.xml`;
   - **Signing policy**: `release-signing` (you are the approver);
   - link the **"GitHub.com" Trusted Build System** to the project;
   - create a **CI user** with an **API token** ("Submitter" permission on the `release-signing` policy).
3. Install the **SignPath** GitHub App on the repository (https://github.com/apps/signpath).
4. In GitHub → Settings → Secrets and variables → Actions:
   - secret `SIGNPATH_API_TOKEN` = the token;
   - variable `SIGNPATH_ORGANIZATION_ID` = your SignPath organization identifier.
   While this variable does not exist, the workflow publishes **unsigned** installers (nothing breaks).
5. Publish the version tag (step 4 below): the **sign** job sends the installers to SignPath, you **approve** the request
   in the portal, then the release resumes with the signed files.

**Limits to know**
- Only the installers are signed. The application and the DLLs they contain are not: that is enough for GitHub, but the
  Microsoft Store may require more (see [STORE-CHECKLIST.md](STORE-CHECKLIST.md)).
- Even signed, a brand-new program may trigger SmartScreen at first: reputation builds up with downloads.
- All jobs must stay on GitHub machines (`windows-latest`, `ubuntu-latest`), with no self-hosted runner.

## 4. Publish version 0.1.0

```powershell
git tag v0.1.0
git push origin v0.1.0
```
The **Release** workflow checks that the version numbers match (`package.json`, `tauri.conf.json`, `Cargo.toml`),
builds two installers, has them signed (if SignPath is configured), computes the checksums and creates a **draft**
release. Review it, add neutral screenshots to the README, then click **Publish release**.

For later versions: change the number in the three files, update `CHANGELOG.md`, then create the tag.

## 5. What next?

The Microsoft Store requires more: automatic updates inside the application, signed binaries inside the installer,
a store listing and a hosted privacy policy. Everything is detailed, with the status of each item, in
[STORE-CHECKLIST.md](STORE-CHECKLIST.md).
