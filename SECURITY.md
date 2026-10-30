# Security

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.
Use the **Security → Report a vulnerability** tab of the GitHub repository (private report).
Describe the problem, the steps to reproduce it and the affected version.

Never attach your IPTV credentials or stream addresses: they often contain your credentials.

## What the application does to protect your data

- Source passwords are stored in the **Windows Credential Manager**, not in a file.
- No telemetry, no account, no servers owned by the project (see [PRIVACY.md](PRIVACY.md)).
- A Content Security Policy (CSP) limits what the interface can load.

## Supported versions

Only the latest published version receives fixes.
