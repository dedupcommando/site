+++
title = "ZFS dedup alternative: offline and file-level — DedupCommando"
description = "An offline, file-level alternative to ZFS dedup: find identical files on your pools and reclaim space by reflink, hardlink or quarantine. No dedup table."
template = "home.html"
[extra]
lang = "en"
dir = "ltr"
h1 = "Offline, file-level deduplication on ZFS — without a dedup table"
+++

**Beta — v{{ version() }}.** DedupCommando changes real files. Read the [safety model](@/en/safety-model.md) before you apply anything, and keep backups.

ZFS can deduplicate on its own: set `dedup=on` and the pool drops duplicate blocks as they are written, at the cost of a dedup table that needs plenty of RAM to stay fast. DedupCommando takes the other route. It scans data already on your pools, finds byte-for-byte identical files, and turns the extra copies into hardlinks, block-cloned reflinks or quarantined deletes — one reviewed batch at a time, under a ZFS snapshot.

## Built-in dedup and file-level dedup are different tools

The `dedup` property works on blocks, inline: where it is enabled, duplicate blocks are removed as data is written ([zfsconcepts(7)](https://openzfs.github.io/openzfs-docs/man/master/7/zfsconcepts.7.html)). Each pool keeps one dedup table (DDT) with an entry per unique block, consulted for every dedup-able block written or freed; when it does not fit in memory, each miss costs a random disk read ([workload tuning](https://openzfs.github.io/openzfs-docs/Performance%20and%20Tuning/Workload%20Tuning.html)). OpenZFS recommends at least 1.25 GiB of RAM per 1 TiB of storage with dedup on, and advises against enabling it unless necessary.

OpenZFS 2.3 added fast dedup (the `fast_dedup` feature, for new dedup tables — [zpool-features(7)](https://openzfs.github.io/openzfs-docs/man/master/7/zpool-features.7.html)), and the table can now be capped on disk (`dedup_table_quota`) and pruned of old unique entries (`zpool ddtprune`). The table gets cheaper but does not go away: dedup stays inline, block by block, for data written while it is on.

DedupCommando works one level up, with file operations — unlink, link, clone — not pool blocks ([what it does not do](@/en/manual/01-intro.md#what-dedupcommando-does-not-do)).

| | `dedup=on` | DedupCommando |
|---|---|---|
| When it runs | Inline, on every write | When you scan, review and apply a plan |
| What it matches | Identical blocks | Whole files, by size and BLAKE3 hash (`--verify`: byte by byte) |
| Data already on the pool | Left as it is; only new writes are deduplicated | What it works on |
| Memory | A pool-wide table, used on every write and free | Only during a scan: about 2.5 KiB per hashed file while grouping, then released |
| Partly identical files | Identical blocks inside them are found | Not found |
| Review before changes | None; it is automatic | Every group, then the batch plan |

## What offline, file-level means

**Offline.** No daemon, watch mode or inotify hook runs in the background. You start a scan yourself, or from cron with `--scan`, and no file is changed until you confirm a batch. Scans resume after an interruption, and a hash cache lets repeat scans skip unchanged files.

**File-level.** Each candidate is hashed whole with BLAKE3 (`--verify` adds a byte-by-byte comparison), identical files form a group, and one file per group is the keeper. There is no fuzzy matching. Files under 4096 bytes are always skipped, and `.zfs` snapshot directories and the quarantine are never scanned ([scanning](@/en/manual/07-scanning.md#permanent-exclusions)). Groups are ranked by the space they would free; duplicate folders ("twin folders") show up too.

## Three ways to reclaim space

Mark one keeper per group with F7, then an action on each copy you want to reclaim. A group with marks but no keeper stops the whole plan.

- **Delete to quarantine (F8).** The copy moves to `.dedcom-quarantine/<timestamp>/` at the root of its dataset, keeping its owner, permissions and xattrs; nothing stays at the old path. The keeper can be anywhere. See [Delete](@/en/manual/08-actions.md#81-delete--move-to-quarantine).
- **Hardlink (F5).** The path becomes another name for the keeper's inode, so it shows the keeper's owner, permissions, ACL and xattrs, and a write through either path is seen by both. Same dataset only. See [Hardlink](@/en/manual/08-actions.md#82-hardlink--a-shared-inode-to-the-keeper).
- **Reflink (F6).** A new inode that shares the keeper's data blocks through ZFS block cloning. dedcom writes the replaced file's owner, mode, ACL, xattrs and timestamps onto the clone before publishing it, or cancels the action if it cannot. Later edits to either copy are copy-on-write. Same dataset only, like a hardlink: each ZFS dataset is a separate filesystem. See [Reflink](@/en/manual/08-actions.md#83-reflink--an-independent-inode-with-shared-blocks).

For both link types, the replacement is built under a temporary name, the original moves into the quarantine, and the replacement takes over the path; if that step fails, the original is put back, or, if its path was taken meanwhile, it stays in the quarantine and the summary names it ([atomic publication](@/en/manual/08-actions.md#85-what-hardlink-and-reflink-share--atomic-publication)). In the project's acceptance test (`scripts/e2e-g5.sh`) on a scratch pool, a reflinked file kept mode 0600, a non-root owner and a user xattr on its own inode while sharing the keeper's blocks.

No action frees space at once: the originals wait in the quarantine, and the batch's snapshot still holds their blocks. [Hardlink vs reflink](@/en/hardlink-vs-reflink/_index.md) goes deeper on the two link types.

## How each batch is protected

- **A snapshot of every dataset in the batch** (`<dataset>@dedcom-<timestamp>`) before the first action. If any snapshot fails, nothing runs. Snapshots are never removed automatically.
- **Revalidation right before each action.** Target and keeper are checked for a symlink swap and a size change, and re-hashed — once per batch with a `stat` check between actions by default, or before every action with `--strict-verify`. A mismatch cancels that action; the rest of the batch continues ([revalidation](@/en/manual/08-actions.md#86-revalidation--the-final-check-before-each-action)).
- **Atomic publish** with `renameat2(RENAME_NOREPLACE)`, so there is no check-then-rename window on the destination.
- **Cross-dataset refusal.** A move across a dataset boundary is refused with an `rsync` hint rather than done as a silent copy-and-delete, which would lose ownership, permissions, ACLs and xattrs, inflate sparse files and break hardlinks ([cross-device](@/en/manual/08-actions.md#87-cross-device--refusal)).

## Requirements

- Linux on x86_64 or aarch64, kernel 3.15 or newer. The pre-built packages need glibc 2.39 or newer (Debian 13, Ubuntu 24.04, Proxmox VE 9).
- ZFS, with `zfs` in `PATH`. dedcom is typically run as root, to take snapshots and scan outside your home directory.
- For reflink: on the host, OpenZFS 2.2.1 or newer with the module parameter `zfs_bclone_enabled` set to 1; on the pool, `feature@block_cloning` enabled or active (`zpool get feature@block_cloning <pool>`). The scan configuration header shows `block cloning: supported=… enabled=…` and whether reflink is available. Without them, delete and hardlink still work, and a plan with a reflink is refused before its confirmation opens (troubleshooting: [the host](@/en/manual/13-troubleshooting.md#cannot-reflink-on-this-host-n-marks--needs-openzfs-221-or-newer-with-zfs_bclone_enabled1-mark-hardlink-or-delete-or-unmark-first-), [the pool](@/en/manual/13-troubleshooting.md#cannot-reflink-on-pool-pool-n-marks--its-block_cloning-feature-is-disabled-mark-hardlink-or-delete-or-unmark-first-)).

On other filesystems a scan runs, but delete, hardlink and reflink are refused: dedcom acts only where it can take a ZFS snapshot first.

## Checking that space came back

Space returns only after both safety nets are cleared. The Summary after an apply lists the snapshots, the quarantine folder and the exact commands to run; the manual suggests a week or two of normal use first ([after apply](@/en/manual/08-actions.md#88-after-apply)):

```sh
zfs list -t snapshot | grep dedcom-    # the batches' safety snapshots
dedcom --purge-quarantine              # lists quarantined files and bytes, deletes nothing
dedcom --purge-quarantine --yes        # irreversible: deletes every quarantine, prints "Reclaimed: …"
zfs destroy tank@dedcom-<timestamp>    # irreversible: one per dataset in the batch
```

Until then, `zfs rollback` to the batch's snapshot undoes it for the whole dataset, including anything written since, and a single file comes back with an `mv` out of the quarantine ([recovery](@/en/safety-model.md#recovery)). Space saved by reflinks shows in the pool's allocation rather than in a dataset's used space.

## FAQ

**Does it find files that are only partly identical?**
No. It matches whole files by size and BLAKE3 hash (`--verify` adds a byte-by-byte compare). Blocks shared between otherwise different files are what `dedup=on` catches and a file-level tool does not.

**Can a reflink join files in two datasets of the same pool?**
No. dedcom clones within one dataset, as with a hardlink, because every ZFS dataset is a separate filesystem. For copies in different datasets, delete to quarantine is the way to reclaim the space.

**Do reflink savings survive `zfs send | zfs recv`?**
Not in the project's own test: the receiving pool took about the size before the reflink pass. Plan the receiving side for the full, undeduplicated size.

## Next steps

- [Install DedupCommando](@/en/_index.md) from APT or a release binary.
- [Read the user manual](@/en/manual/_index.md), starting with the [quickstart](@/en/manual/04-quickstart.md).
- [Safety, recovery and limitations](@/en/safety-model.md) — read it before the first apply.
