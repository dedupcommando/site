+++
title = "DedupCommando vs fdupes, jdupes, rmlint, fclones and Czkawka"
description = "DedupCommando compared with fdupes, jdupes, rmlint, rdfind, fclones, Czkawka, dupeGuru and duperemove: checks, actions, undo, ZFS safety and packages."
template = "home.html"
[extra]
lang = "en"
dir = "ltr"
h1 = "DedupCommando compared with fdupes, jdupes, rmlint, rdfind, fclones, Czkawka, dupeGuru and duperemove"
+++

This page compares DedupCommando v{{ version() }}, a beta [duplicate file finder for Linux](@/en/linux-duplicate-file-finder/_index.md), with eight established ones, using each project's own documentation, release notes and package listings. The others are more widely packaged, run on more systems and have been around longer, and Czkawka and dupeGuru are full desktop apps. DedupCommando is narrower: a terminal tool for ZFS pools that wraps every change in a snapshot, a quarantine and a fresh check.

## Who each tool is for

- **[fdupes](https://github.com/adrianlopezroche/fdupes)** — for choosing by hand what to delete. The classic C tool (copyright from 1999) checks size and MD5, then compares byte by byte, offers an ncurses deletion screen and a signature cache; its man page lists no link action.
- **[jdupes](https://codeberg.org/jbruchon/jdupes)** — for scripted clean-ups. Forked from fdupes 1.51 and now hosted on Codeberg, it hashes with xxHash, still compares byte by byte, and can delete, hardlink, symlink or, on Btrfs, XFS and APFS, clone (`-B`); it runs natively on Windows too. *fdupes vs jdupes:* fdupes for its deletion screen, jdupes for links or clones.
- **[rmlint](https://rmlint.readthedocs.io/en/stable/)** — for reading a plan before anything changes. It finds duplicates and other "lint" such as broken symlinks, and writes a shell script to review and run, with handlers to remove, hardlink, symlink, reflink or clone; BLAKE2b by default, byte by byte on request, and an optional GUI, Shredder.
- **[rdfind](https://github.com/pauldreik/rdfind)** — for a one-shot run with a clear rule for which copy stays. The C++ tool filters by size, first and last bytes and a checksum (SHA-1 by default), ranks the copies, then deletes the extras or swaps them for hardlinks or symlinks; it has a dry run.
- **[fclones](https://github.com/pkolaczk/fclones)** — for large trees and shell pipelines. A Rust CLI built for speed: `fclones group` lists duplicates, and `remove`, `link`, `move` or `dedupe` act on that list, with `--dry-run`. It trusts hashes of 128 bits or more; there is no byte-by-byte comparison.
- **[Czkawka](https://github.com/qarmin/czkawka)** — for one desktop app covering duplicates, empty folders, similar images and videos, and music. Written in Rust, with the Krokiet GUI (the GTK app ends at 12.0) and a CLI, it matches by size, a partial hash and BLAKE3, and can delete, move to the trash, hardlink or symlink.
- **[dupeGuru](https://dupeguru.voltaicideas.net/)** — for a GUI on Linux, macOS or Windows with picture and music modes. Written mostly in Python with Qt, it sends duplicates to the trash by default or replaces them with symlinks or hardlinks; its latest release, 4.3.1, is from July 2022.
- **[duperemove](https://github.com/markfasheh/duperemove)** — for sharing storage on btrfs and XFS without removing any file. It hashes extents and passes identical ranges to the kernel's `FIDEDUPERANGE` ioctl, which compares the bytes first; a hashfile makes repeat runs incremental.
- **DedupCommando** — for ZFS pools, including storage on Proxmox VE, where you want a safety net and a review step. A Rust TUI, it hashes with BLAKE3, lets you mark a keeper per group, then deletes to a quarantine, hardlinks or reflinks under a ZFS snapshot.

## At a glance

| Tool | Interface | How duplicates are confirmed | Hardlink | Reflink / dedupe | Reversible delete | ZFS snapshot before changes | Packages |
|---|---|---|---|---|---|---|---|
| fdupes | CLI; ncurses screen for deleting | Size, MD5, then byte by byte | Not documented | Not documented | Not documented | Not documented | Debian, Ubuntu, Arch, Homebrew |
| jdupes | CLI | Size, xxHash, then byte by byte (`-Q` skips it) | Yes (`-L`) | `-B`: Btrfs, XFS, APFS | Not documented | Not documented | Debian, Ubuntu, Arch, Homebrew |
| rmlint | CLI (writes a script); GUI: Shredder | BLAKE2b by default, or byte by byte | Yes | `clone` (FIDEDUPERANGE), `reflink` (like `cp --reflink`) | Via a user command (`trash-put`) | Not documented | Debian, Ubuntu, Homebrew |
| rdfind | CLI | Size, first/last bytes, SHA-1 by default | Yes | Not documented | No: deletes (unlink); dry run | Not documented | Debian, Ubuntu, Arch, Homebrew |
| fclones | CLI | Hash only (metro by default) | Yes | `dedupe` (reflink; not on Windows) | Not documented; `move` sets files aside | Not documented | Arch, Homebrew, Snap, crates.io |
| Czkawka | GUI (Krokiet, GTK) and CLI | Size, partial hash, BLAKE3 | Yes | Not documented | Yes: system trash (option) | Not documented | Debian, Ubuntu 25.10+, Homebrew, crates.io, Flathub (GTK 10.0) |
| dupeGuru | GUI (Qt) | Size and xxHash (MD5 fallback) | Yes | Not documented | Yes: trash by default | Not documented | Debian, Ubuntu, own installers |
| duperemove | CLI | Extent hashes; kernel compares bytes | n/a (extent-level tool) | FIDEDUPERANGE; btrfs and XFS only | n/a (no delete option) | Not documented | Debian, Ubuntu, Arch |
| DedupCommando | TUI (commander or wizard) | BLAKE3; optional byte by byte | Yes, within one dataset | ZFS block cloning (OpenZFS ≥ 2.2.1, `zfs_bclone_enabled=1`), within one dataset | Yes: per-dataset quarantine | Yes: every dataset in the batch | Own APT repo, release tarballs |

"Not documented": the project's own docs don't describe it. Packages: official Debian, Ubuntu and Arch repositories, Homebrew, crates.io, Flathub and channels a project names itself (AUR not checked).

### ZFS and reflinks

OpenZFS 2.2.0 added [block cloning](https://github.com/openzfs/zfs/releases/tag/zfs-2.2.0), which newer versions of `cp` use to make clones. The dedupe ioctl `FIDEDUPERANGE`, used by duperemove and rmlint's `clone` handler, was [left returning an error on ZFS](https://github.com/openzfs/zfs/pull/15050); an implementation [reached the development branch](https://github.com/openzfs/zfs/pull/18745) on 20 August 2026 but has not shipped in a release (latest: [2.4.4](https://github.com/openzfs/zfs/releases/tag/zfs-2.4.4)). fclones' `dedupe` uses `FICLONE`, and jdupes names Btrfs, XFS and APFS for `-B`; none of these four mentions ZFS in its README or man page. DedupCommando's reflink needs OpenZFS 2.2.1+ with `zfs_bclone_enabled=1` and the pool's `block_cloning` and, like a hardlink, stays within one dataset.

## Where the others are better

- **Desktop GUIs and look-alike media.** Czkawka and dupeGuru are point-and-click apps that also find similar images; Czkawka adds similar videos and music. DedupCommando is terminal-only and matches byte-identical files only ([what it does not do](@/en/manual/01-intro.md#what-dedupcommando-does-not-do)).
- **Published speed numbers.** fclones came first in both runs of its [README benchmark](https://github.com/pkolaczk/fclones#benchmarks): 35 seconds for 1.46 million paths (316 GB) on an SSD, against two to eight minutes for Czkawka, rmlint, jdupes, fdupes, rdfind and dupeGuru; every tool was an older version. DedupCommando publishes no comparable benchmark.
- **Packaging.** fdupes, jdupes and rdfind are in Debian, Ubuntu, Arch and Homebrew; fclones and Czkawka are on crates.io, Czkawka also on Flathub. DedupCommando has only its own [APT repository](@/en/manual/02-install.md#install-from-the-apt-repository-debian--proxmox-ve) (Debian 13, Proxmox VE 9) and release tarballs for amd64 and arm64 (glibc ≥ 2.39); crates.io holds only a 0.0.0 name placeholder, and it is not on AUR, Homebrew or in distribution repositories.
- **Maturity.** fdupes dates from 1999 and jdupes grew out of it; DedupCommando is a young beta, as the leading zero in its version says.
- **Platforms.** jdupes runs natively on Windows, and fclones, Czkawka and dupeGuru also run on Windows and macOS. DedupCommando is Linux-only.
- **Unattended changes.** jdupes, rdfind and fclones can link or remove from a script or a cron job. DedupCommando's headless mode only scans; applying needs the TUI, [by design](@/en/manual/11-headless.md#applying-actions-from-headless--no).
- **Partial matches and other filesystems.** duperemove shares identical extents, so partly identical files still save space. DedupCommando works on whole files, and outside ZFS it only scans: it acts only where it can take a ZFS snapshot first ([limitations](@/en/safety-model.md#limitations)).

## Where DedupCommando is different

Others let you look first too: fdupes re-checks files before deleting, rmlint's script is meant to be reviewed, fclones and rdfind have dry runs. DedupCommando differs in what surrounds each change ([safety model](@/en/safety-model.md)):

- **A snapshot per dataset, before the batch.** Every dataset the batch touches is snapshotted first; if one snapshot fails, nothing runs ([snapshots](@/en/manual/03-safety.md#1-zfs-snapshot-of-the-action-batch)).
- **Quarantine instead of delete.** "Delete" moves the file to `.dedcom-quarantine/` on its dataset, with its owner, permissions and extended attributes; the space returns once you purge it and destroy the batch snapshot ([quarantine](@/en/manual/03-safety.md#2-quarantine-instead-of-unlink)).
- **Re-validation before each action.** Right before each action the file being replaced is checked again for a symlink swap, its size and its content hash; the keeper is hashed on first use in the batch and re-checked with stat after that (every time with `--strict-verify`); a mismatch cancels that action ([revalidation](@/en/manual/08-actions.md#86-revalidation--the-final-check-before-each-action)).
- **Atomic publish.** The original moves to quarantine and `renameat2(RENAME_NOREPLACE)` puts the prepared link in its place; if that fails, the original comes back ([atomic publication](@/en/manual/08-actions.md#85-what-hardlink-and-reflink-share--atomic-publication)).
- **Reflink through ZFS block cloning.** The duplicate becomes its own file that shares blocks with the keeper and keeps its owner, mode, ACL, extended attributes and timestamps ([reflink](@/en/manual/08-actions.md#83-reflink--an-independent-inode-with-shared-blocks); [hardlink vs reflink](@/en/hardlink-vs-reflink/_index.md)).
- **Dataset awareness.** Snapshots and quarantine follow dataset boundaries, and a move across one is refused with an `rsync` hint instead of a silent copy-and-delete ([cross-dataset refusal](@/en/manual/03-safety.md#6-cross-device--refusal-not-work-around-it-by-copying)).
- **Review in a TUI first.** You mark a keeper and an action per group; F11 shows the batch by type, its first paths and the generated shell script, which you can save for your records ([confirmation](@/en/manual/04-quickstart.md#step-9-f11--confirmation)).
- **Resumable scans.** Walking and hashing are checkpointed, so a scan interrupted midway resumes ([resume](@/en/manual/07-scanning.md#resume--continue-an-unfinished-scan)). Hash caches are common: all the others except rdfind document one.

## Which one should you use

- **Cleaning up photos on a desktop:** a GUI tool, Czkawka (Krokiet) or dupeGuru, which also find similar, not just identical, pictures.
- **Block-level savings on btrfs or XFS:** duperemove; the kernel checks each range before sharing it. jdupes `-B` and rmlint's `clone` handler cover whole files there.
- **A quick one-off on the command line:** jdupes, fclones or rdfind; fdupes if you want to pick keepers in an interactive screen, fclones for very large trees.
- **ZFS storage, including Proxmox VE hosts, with a safety net and a review step:** DedupCommando, a jdupes or Czkawka alternative for that case. Scan with the [Idle profile](@/en/manual/07-scanning.md#intensity-profiles-resource-governor) on a busy host, review in the TUI, and apply under a snapshot with quarantine. Read the [safety model](@/en/safety-model.md) first, and see [file-level deduplication on ZFS](@/en/zfs-file-deduplication/_index.md).

Facts checked on 2026-09-28; [tell us if something changed](https://github.com/dedupcommando/DedupCommando/issues).

Man pages used: [fdupes](https://manpages.debian.org/unstable/fdupes/fdupes.1.en.html), [jdupes](https://manpages.debian.org/unstable/jdupes/jdupes.1.en.html), [rmlint](https://rmlint.readthedocs.io/en/stable/rmlint.1.html), [rdfind](https://manpages.debian.org/unstable/rdfind/rdfind.1.en.html), [duperemove](https://manpages.debian.org/unstable/duperemove/duperemove.8.en.html).

DedupCommando is an independent project, not affiliated with the projects compared here or with Proxmox Server Solutions GmbH.
