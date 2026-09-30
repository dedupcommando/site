+++
title = "FAQ: Duplicate Files on ZFS and Proxmox VE — DedupCommando"
description = "Answers for ZFS and Proxmox VE admins: why not zfs set dedup=on, safety on a live host, undoing a delete, root, cron, memory, and verifying downloads."
template = "home.html"
[extra]
lang = "en"
dir = "ltr"
h1 = "DedupCommando FAQ"
+++

Short answers for ZFS and Proxmox VE administrators, each linked to the manual section with the detail. DedupCommando is beta software (v{{ version() }}): read the [safety guide](@/en/safety-model.md) before applying anything, and keep backups.

## Why not just turn on ZFS dedup (`zfs set dedup=on`)?

`zfs set dedup=on` is block-level deduplication inside the pool; the manual calls it usually unnecessary and notes it eats RAM and CPU. DedupCommando works at the file level instead: it finds byte-for-byte identical files and reclaims their space with ordinary filesystem operations (delete to quarantine, hardlink or reflink). There is no always-on dedup table and no background daemon, and nothing changes until you confirm a plan. See [what DedupCommando does not do](@/en/manual/01-intro.md#what-dedupcommando-does-not-do).

## Is it safe to use on a production host?

A scan changes no file contents, and the Idle profile (one thread, `nice 19`, `ionice idle`), which the manual asks for on live data, gives it the lowest CPU and I/O priority. Duplicates are deleted or relinked only when you apply, and every batch runs under a per-dataset ZFS snapshot, with deleted files moved to a quarantine and each action revalidated first. DedupCommando is still beta software, so rehearse on a test pool, apply in a maintenance window, and keep backups. See [the Idle profile on production data](@/en/manual/03-safety.md#the-idle-profile-on-production-data) and [safety and recovery](@/en/safety-and-recovery/_index.md).

## What happens if a file changes between the scan and the apply?

Right before each action, dedcom re-checks the target and the keeper: a symlink check and a size check every time, then the content (in the default Hybrid mode each distinct file is hashed once per batch; `--strict-verify` re-hashes before every action). If anything differs, that one action is canceled with a reason such as `changed after the scan (content)`, and the rest of the batch continues. Canceled items keep their marks, so you can re-scan, check them and press F11 again. Revalidation does not warn you before F11, so on large datasets apply when writing workloads are stopped. See [revalidation](@/en/manual/08-actions.md#86-revalidation--the-final-check-before-each-action).

## What exactly is kept when a duplicate becomes a hardlink or a reflink?

A hardlink makes the duplicate's path point to the keeper's inode, so owner, permissions, ACLs and xattrs become the keeper's, and a write through one path is seen at every path. A reflink is a new inode that shares the keeper's blocks: dedcom writes the replaced file's owner, mode, ACLs, extended attributes and timestamps onto it before publishing, or cancels the action if it cannot. Editing a reflinked copy leaves the others unchanged. Both work only within one dataset, and in both cases the original goes to quarantine first, where it keeps its own metadata until you purge. See [hardlink](@/en/manual/08-actions.md#82-hardlink--a-shared-inode-to-the-keeper) and [reflink](@/en/manual/08-actions.md#83-reflink--an-independent-inode-with-shared-blocks).

## Why does it need root?

Taking ZFS snapshots and scanning outside your home directory need privileges, so dedcom typically runs as root, which is the default on Proxmox VE. As an unprivileged user the snapshots are unavailable unless you set up `zfs allow` or sudo, and a batch whose snapshot cannot be taken is cancelled before any file is changed. The tool may also fail to see your pools when `zfs` runs unprivileged. See [installation](@/en/manual/02-install.md) and [dedcom does not see my pools](@/en/manual/13-troubleshooting.md#dedcom-does-not-see-my-pools).

## Does it work without ZFS?

Scanning does: on non-ZFS filesystems the walk and hash run fine. Actions do not: delete, hardlink and reflink are refused for any file dedcom cannot place on a ZFS dataset, because it acts only where it can take a ZFS snapshot first. Reflink additionally needs OpenZFS 2.2.1 or newer with `zfs_bclone_enabled=1` and the pool's `feature@block_cloning`. Before applying, check with `df -T <path>` that every root lies entirely on ZFS. See [what DedupCommando does not do](@/en/manual/01-intro.md#what-dedupcommando-does-not-do).

## What was it tested on?

It was developed and tested against ZFS pools including Proxmox VE, and is tested on Proxmox VE 9.1 with OpenZFS 2.3. It runs on Linux x86_64 and aarch64 with kernel 3.15 or newer. The pre-built packages and binaries need glibc 2.39 or newer (Debian 13, Ubuntu 24.04, Proxmox VE 9 or newer). On Proxmox VE 8 or Debian 12, build natively with a Rust toolchain (1.82+) on that system: a binary from the maintainers' Docker wrapper (`rust:1.95.0` image) needs a newer glibc and will not run there. See [requirements](@/en/manual/01-intro.md#requirements) and [installation](@/en/manual/02-install.md#install-from-the-apt-repository-debian--proxmox-ve).

## How do I undo a delete?

A delete is a move into the dataset's quarantine, so undoing it for one file is a plain `mv` back to the original path:

```text
find /tank/.dedcom-quarantine -type f -name 'photo.jpg'
mv /tank/.dedcom-quarantine/<ts>/media/photo.jpg /tank/media/photo.jpg
```

To undo a whole batch, run `zfs rollback <dataset>@dedcom-<ts>` for each affected dataset, but this reverts the entire dataset, including everything else written since. If the dataset has newer snapshots, `zfs rollback` refuses unless given `-r`, which destroys those newer snapshots: list them first with `zfs list -t snapshot <dataset>`. After `dedcom --purge-quarantine --yes`, the quarantine copy is gone for good. See [bringing back one file](@/en/manual/03-safety.md#want-to-bring-back-one-specific-file-from-quarantine).

## Can I run it from cron, without the UI?

Yes, except for applying: `--scan`, `--stats`, `--compact-db`, `--export-csv` and `--purge-quarantine` run without the TUI, exit non-zero on error and never prompt, so a writing mode just fails if another instance holds the lock. Applying is interactive by design: it happens in the F11 confirmation, where you can also save the plan as a `.sh` script to review or run by hand. For a nightly scan on a live host, wrap `--scan` in `nice -n 19 ionice -c 3`: every new headless scan runs on the Balanced profile, whatever the TUI last used. See [the cron example](@/en/manual/11-headless.md#cron-example-a-nightly-scan-of-tank) and [why there is no headless apply](@/en/manual/11-headless.md#applying-actions-from-headless--no).

## How much memory does a big scan need?

The walk and hash phases need only tens of MB. The grouping phase peaks at about 2.5 KiB per hashed file with the default algorithm (roughly 2.4 GiB for 1 million files, 4.8 GiB for 2 million, 12 GiB for 5 million), then returns it. Before that phase, dedcom compares its forecast with free RAM and warns you if it does not fit. `--merkle-dirs` produces the same groups with memory proportional to tree depth, typically tens to hundreds of MB, and the manual calls it required at 5 million files. See [estimating the memory peak](@/en/manual/07-scanning.md#estimating-the-33-memory-peak-for-the-default-algorithm).

## Should I run it on backup storage or virtual machine disks?

No: leave other programs' stores out of the scan. That means a Proxmox Backup Server datastore; a restic, borg, kopia, Arq or Duplicacy repository; a Time Machine sparse bundle; a virtual machine's disk. Such a store needs every one of its files at its own path with its own content, and restic, borg, kopia, Duplicacy, Arq and Proxmox Backup Server already store each piece of data only once. A delete inside a store breaks it at once, and a hardlink makes two copies one file, so a program that later writes in place changes both. A scan root takes in every dataset mounted below it and there is no way to exclude a path, so choose roots that do not reach any store. A folder of plain copies you made yourself is not a store. The manual covers this in [section 8.9](@/en/manual/08-actions.md#89-backups-and-other-programs-stores).

## How do I verify a download?

Each release on GitHub Releases ships a SHA-256 checksum, a minisign signature, a CycloneDX SBOM and a SLSA build-provenance attestation. Check the tarball with `sha256sum -c dedcom-<version>-<triple>.tar.gz.sha256`, its signature with `minisign -Vm dedcom-<version>-<triple>.tar.gz -p minisign.pub`, and its provenance with `gh attestation verify`. If you install from the APT repository, `apt` checks the GPG-signed repository metadata for you. See [verifying releases](@/en/verifying-releases.md).

## Is it free, and what is the license?

Yes. DedupCommando is free, open-source software released under the Apache-2.0 license. Each release tarball includes the `LICENSE`, `NOTICE` and `THIRD-PARTY-NOTICES` files, and the SBOM lists the licenses of its dependencies. See [who wrote it and for whom](@/en/manual/01-intro.md#who-wrote-it-and-for-whom).


## Next steps

- [Documentation home](@/en/_index.md): install, first scan and guides.
- [User manual](@/en/manual/_index.md): every chapter, from installation to troubleshooting.
- [Safety, recovery and limitations](@/en/safety-model.md): the authoritative safety reference.
