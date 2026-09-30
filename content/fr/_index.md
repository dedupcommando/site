+++
title = "DedupCommando — Détecteur sûr de fichiers et dossiers en double pour Linux"
description = "CLI et TUI Linux axé sur la sécurité pour trouver les fichiers et dossiers en double et récupérer de l'espace avec hardlinks, reflinks et des workflows adaptés à ZFS. Open source, bêta."
template = "home.html"
[extra]
lang = "fr"
dir = "ltr"
h1 = "Trouvez les fichiers et dossiers en double et récupérez de l'espace, en toute sécurité"
+++

**Bêta — v{{ version() }}.** DedupCommando effectue des opérations destructrices (suppression, hardlink, reflink) sur de vrais fichiers. Lisez le guide de sécurité avant d'appliquer quoi que ce soit et conservez des sauvegardes.

DedupCommando est un outil en terminal pour Linux (CLI et TUI) qui trouve les **fichiers et dossiers identiques octet par octet** et récupère l'espace qu'ils gaspillent — conçu pour le stockage **ZFS**, y compris celui hébergé sur des systèmes Proxmox VE. La sécurité des données passe avant tout : chaque lot destructif s'exécute sous un instantané (snapshot) ZFS, les fichiers « supprimés » sont déplacés vers une quarantaine au lieu d'être effacés, et le contenu est revalidé juste avant chaque action.

## La sécurité d'abord

- Un **instantané ZFS** de chaque dataset concerné est pris avant la première action ; si l'un échoue, tout le lot est annulé.
- **« Supprimer » déplace les fichiers vers une quarantaine**, pas d'`unlink` — réversible jusqu'à ce que vous la vidiez explicitement.
- Le contenu est **revalidé** (re-hash / re-stat) juste avant chaque action ; toute différence annule cette action.
- Les fichiers sont publiés de façon atomique avec `renameat2(RENAME_NOREPLACE)` — sans la course « vérifier puis renommer ».
- Un **verrou d'instance unique** empêche les écritures concurrentes ; les déplacements entre datasets sont refusés, jamais une copie silencieuse suivie d'une suppression.

## Trois façons de récupérer de l'espace

- **Supprimer vers la quarantaine** — retirez un doublon tout en le gardant récupérable jusqu'au vidage.
- **Hardlink** — faites pointer les doublons vers un même inode (au sein d'un seul dataset).
- **Reflink** — clone de blocs en copie sur écriture (CoW) sur ZFS avec `block_cloning` (dans le même dataset) ; métadonnées indépendantes, blocs partagés jusqu'à ce qu'un fichier change.

Dans chaque groupe, un fichier est celui **conservé** (keeper) ; les autres deviennent des liens ou partent en quarantaine.

## Comment ça marche

1. **Analyser** — parcourt les chemins choisis, hache les candidats avec **BLAKE3** (avec une recomparaison octet par octet en option) et regroupe les fichiers identiques. Les analyses sont reprenables et mises en cache pour des reprises quasi instantanées.
2. **Examiner** — parcourez les groupes de doublons dans le **commander** multi-panneaux (par défaut) ou un assistant classique pas à pas (`--classic`) ; marquez un keeper et l'action de chaque groupe. Il détecte aussi les **« dossiers jumeaux »** : des arborescences au contenu identique.
3. **Appliquer** — vérifiez le plan et appliquez-le de façon interactive, ou enregistrez-le comme script shell. Un **régulateur de ressources** (Turbo / Balanced / Idle) : sur un hôte chargé, Idle analyse avec un seul thread et la priorité CPU et disque la plus basse (`nice 19`, `ionice idle`).

## Conçu pour ZFS, fonctionne sur Proxmox VE

DedupCommando est conçu pour ZFS : les instantanés, les limites par dataset et le reflink s'appuient dessus. Il est testé sur Proxmox VE 9.1 (OpenZFS 2.3), où ZFS est disponible d'origine. Il s'agit de déduplication **au niveau des fichiers** — trouver et supprimer des fichiers en double — pas de la déduplication au niveau des blocs intégrée à ZFS (`zfs set dedup`), ni de compression.

> Sur les systèmes de fichiers non-ZFS, l'analyse fonctionne, mais la suppression, le hardlink et le reflink sont refusés : DedupCommando n'agit que là où il peut d'abord prendre un instantané ZFS.

## Prérequis

- **Linux**, noyau ≥ 3.15, x86_64 ou aarch64 ; les paquets précompilés exigent glibc ≥ 2.39 (Debian 13, Ubuntu 24.04, Proxmox VE 9).
- **ZFS requis pour appliquer des actions** (sécurité par instantanés, détection des datasets, reflink) ; sans ZFS, analyse seulement ; `zfs` dans le `PATH`, généralement exécuté en root.
- Un terminal UTF-8 en 256 couleurs.

## Démarrer

**Debian 13 / Proxmox VE 9+** — installez depuis le dépôt APT signé (mises à jour via `apt upgrade`) :

```sh
# as root (Proxmox default); on non-root Debian run: sudo -i
curl -fsSL https://dedupcommando.github.io/apt/dedcom-archive-keyring.gpg \
  -o /usr/share/keyrings/dedcom-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/dedcom-archive-keyring.gpg] https://dedupcommando.github.io/apt stable main" \
  | tee /etc/apt/sources.list.d/dedcom.list
apt update && apt install dedcom
```

Des binaires précompilés sont joints à chaque release GitHub (amd64 et arm64) — téléchargez, **vérifiez**, puis installez :

```sh
tar xzf dedcom-<version>-<triple>.tar.gz
install -m 755 dedcom-<version>-<triple>/dedcom /usr/local/bin/dedcom
```

Compilation depuis les sources : sur un système plus ancien comme Proxmox VE 8 / Debian 12, compilez nativement avec une toolchain Rust (1.82+) sur ce système même ; un binaire issu du script Docker des mainteneurs (image `rust:1.95.0`) exige une glibc plus récente et n'y fonctionnera pas (voir [CONTRIBUTING](https://github.com/dedupcommando/DedupCommando/blob/main/CONTRIBUTING.md)).

- [Dernière version](https://github.com/dedupcommando/DedupCommando/releases) · [Code sur GitHub](https://github.com/dedupcommando/DedupCommando)
- Plus de détails (en anglais) : [doublons sur ZFS](@/en/zfs-file-deduplication/_index.md) · [sur Proxmox VE](@/en/proxmox-ve-duplicate-files/_index.md) · [le détecteur Linux de doublons](@/en/linux-duplicate-file-finder/_index.md) · [hardlink vs reflink](@/en/hardlink-vs-reflink/_index.md) · [sécurité et récupération](@/en/safety-and-recovery/_index.md) · [documentation](@/en/_index.md)
