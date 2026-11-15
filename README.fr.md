# LAMAYNE IPTV

[English](README.md) · **Français**

> **Marre des lecteurs IPTV qui font payer rien que pour enregistrer un favori ? Des applis lourdes qui rament ?**
> Celui-ci est pour vous.

LAMAYNE IPTV est un lecteur gratuit et open source pour **votre propre** abonnement IPTV (Xtream Codes ou M3U), pour
**Windows 10/11** et **Android TV / Google TV**. Pas de pub, pas de compte, pas de télémétrie, pas de version premium.
Les favoris, l'historique et les profils sont gratuits, et le resteront.

[![Dernière version Windows](https://img.shields.io/github/v/release/lamayne/lamayne-iptv?label=Windows)](../../releases/latest)
[![Licence : MIT](https://img.shields.io/badge/licence-MIT-blue.svg)](LICENSE)

> **LAMAYNE IPTV ne fournit aucun contenu, aucune chaîne et aucun abonnement.**
> Utilisez uniquement des sources pour lesquelles vous disposez des autorisations nécessaires.

<!--
  Ajoutez ici 2 ou 3 captures d'écran, avec des données neutres : sans logos de chaînes ni affiches protégées, et rien qui
  montre votre nom, vos dossiers ou vos identifiants.
-->

## Pourquoi l'essayer

- **Tout est gratuit.** Favoris, chaînes récentes, reprise de lecture, plusieurs profils et sources, catégories masquables :
  pas de mur payant, pas de version « pro », pas de compte à créer.
- **Léger et rapide.** L'application Windows est faite avec Tauri et Rust (pas de navigateur embarqué) : l'installateur
  fait environ 35 Mo, et la lecture utilise mpv avec décodage matériel. L'application Android TV est entièrement native
  (Kotlin, sans vue web).
- **Respectueux de votre vie privée.** Pas de télémétrie, pas de publicité, pas de traqueurs. Vos réglages et favoris
  restent sur votre appareil, et vos identifiants sont dans le Gestionnaire d'identifiants de Windows, ou chiffrés avec le
  Keystore Android sur la TV (voir [PRIVACY.md](PRIVACY.md)).
- **Ouvert.** Licence MIT. Les installateurs sont construits depuis ce dépôt par GitHub Actions, et chaque version est
  accompagnée de sommes de contrôle SHA-256.

## Fonctionnalités

| | Windows | Android TV / Google TV |
|---|---|---|
| Live TV avec guide des programmes (maintenant / ensuite) | ✅ | ✅ |
| Favoris, récemment regardé, recherche | ✅ | ✅ |
| Films et séries, reprise de lecture | ✅ | ✅ |
| Compte Xtream Codes | ✅ | ✅ |
| Playlist M3U | ✅ | ✅ (live TV) |
| Plusieurs profils | ✅ | |
| Page d'un acteur avec ses titres de votre catalogue | ✅ | ✅ |
| Films et séries similaires | ✅ | ✅ |
| Image dans l'image, mode théâtre, plein écran | ✅ | |
| Diffusion vers Chromecast / Google TV du réseau | ✅ | |
| Choix de la piste audio et des sous-titres | ✅ | ✅ |
| Raccourcis clavier et boutons latéraux de la souris | ✅ | |
| Accueil adapté à la télécommande, avec bannière | | ✅ |
| Interface en français, anglais et espagnol | ✅ | ✅ |

La liste des raccourcis clavier est dans **Réglages → À propos**.

## Téléchargement

**Windows 10/11**

1. Ouvrez la page [Releases](../../releases) et téléchargez `LAMAYNE-IPTV_…_x64-setup.exe`.
2. Lancez-le, puis ajoutez votre source dans **Réglages → Profils et sources**.

> L'installateur n'est pas encore signé (voir [Signature du code](#signature-du-code)) : Windows peut afficher
> « Windows a protégé votre PC ». Cliquez sur **Informations complémentaires**, puis **Exécuter quand même**. Sur certains
> Windows 11 (Smart App Control), les installateurs non signés peuvent être bloqués complètement.
> Pour vérifier votre téléchargement, comparez son SHA-256 à celui des notes de la version :
> `Get-FileHash .\LAMAYNE-IPTV_…_x64-setup.exe -Algorithm SHA256`

**Android TV / Google TV**

Installez l'apk avec l'application **Downloader** : voir [tv/INSTALL.md](tv/INSTALL.md). L'apk se trouve dans les versions
nommées **LAMAYNE TV**, et il est signé.

## Compiler depuis les sources

Prérequis : Node.js 20+, pnpm, Rust (stable) et les outils de compilation C++ de Visual Studio.

```powershell
pnpm install
npx tauri-plugin-libmpv-api setup-lib   # télécharge libmpv-2.dll et libmpv-wrapper.dll
pnpm tauri dev                           # mode développement
pnpm tauri build                         # installateur dans src-tauri/target/release/bundle
```

Vérifications avant de proposer une modification :

```powershell
pnpm typecheck      # types TypeScript
pnpm test           # tests automatiques
pnpm check:i18n     # traductions complètes et cohérentes
```

L'application Android TV est dans [`tv/`](tv/) (voir [tv/README.md](tv/README.md)).
Pour ajouter une langue : [docs/ADD-A-LANGUAGE.md](docs/ADD-A-LANGUAGE.md).

## Signaler un problème

Ouvrez une [issue](../../issues/new?template=bug_report.md) en collant les infos de diagnostic
(**Réglages → À propos → Copier les infos de diagnostic**). Ne publiez jamais vos identifiants IPTV.
Pour une faille de sécurité : voir [SECURITY.md](SECURITY.md).

## Signature du code

Voir [docs/CODE-SIGNING-POLICY.md](docs/CODE-SIGNING-POLICY.md). L'installateur Windows n'est pas encore signé.

## Soutenir le projet

LAMAYNE IPTV est fait sur du temps libre. Si l'application vous est utile, vous pouvez
[m'offrir un café](https://buymeacoffee.com/lamayne) ou trouver les autres moyens sur [linktr.ee/lamayne](https://linktr.ee/lamayne).
Une étoile sur ce dépôt aide aussi.

## Licence

[MIT](LICENSE). Composants tiers : voir [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
