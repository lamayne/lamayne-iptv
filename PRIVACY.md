# Privacy policy — LAMAYNE IPTV

*Version 0.1.0.*

> Review this text with every release: each statement must remain accurate.

LAMAYNE IPTV is an application that runs on your computer. It has no account system and no servers of its own, and it
**collects no usage data** (no telemetry, no advertising, no trackers).

## What is stored on your computer

- **Settings, profiles, favourites, watch history and preferences**: in the application's local storage.
- **Recently watched channels**: a fingerprint of each channel's identifier and the viewing time, never the stream address.
- **Your sources' credentials (server, username, password)**: in the **Windows Credential Manager**.
- **Cached data** (programme guide, movie details): on your computer, to avoid downloading it repeatedly.

Uninstalling the application and deleting its local data erases this information.

## Network connections made by the application

The application only contacts:

1. **Your IPTV provider** (the server you added) to list and play content. It sends it your credentials, like any IPTV
   player. Its privacy policy is its own.
2. **The image hosts** indicated by your provider (posters, channel logos).
3. **epg.pw**, a public programme-guide service, to display the schedule of some channels. Only a country code is sent
   (for example `FR`); matching with your channels is then done on your computer, and your credentials are never sent to it.
4. **Google devices on your local network**, if you use "Cast": the application discovers them on the local network, then
   sends them the **stream address, which contains your IPTV credentials**. Only use this feature on a network you trust.
5. **Your browser**, when you click a link (Buy Me a Coffee, bug reports): the site that opens applies its own policy.

No other data is sent to the author of the application or to any third party.

## Your rights

Since your data stays on your computer, you control it directly: view, edit or delete it from the application, from the
Windows Credential Manager, or by uninstalling the application.

## Contact

Open an issue at https://github.com/lamayne/lamayne-iptv/issues (never post your IPTV credentials there).
For a security vulnerability, see [SECURITY.md](SECURITY.md).
