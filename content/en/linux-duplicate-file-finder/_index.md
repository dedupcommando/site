+++
title = "Duplicate File Finder for Linux (TUI and CLI) — DedupCommando"
description = "Find duplicate files on Linux in a terminal UI or from cron: BLAKE3 hashing, resumable scans, then delete, hardlink or reflink under a ZFS snapshot."
template = "home.html"
[extra]
lang = "en"
dir = "ltr"
h1 = "Find duplicate files on Linux, delete them safely on ZFS"
+++

DedupCommando (command `dedcom`) is a duplicate file finder for Linux, with a multi-panel terminal interface and a headless mode for scripts and cron. It finds files that are **byte-for-byte identical**, whatever their names, and helps you reclaim the space: move the copies to a quarantine, or replace them with hardlinks or reflinks. It is built for ZFS and changes files only there, each batch under a snapshot.

DedupCommando v{{ version() }} is beta software that changes real files. Read the [safety model](@/en/safety-model.md) before applying anything, and keep backups.

## How DedupCommando finds duplicate files

To find duplicate files on Linux, a scan runs in three phases and keeps its results in an SQLite database, `dedcom.db`:

1. **Walk.** Traverse the roots you chose, `lstat` every entry and record the file list: minutes per million files.
2. **Hash.** Read the files and compute a **BLAKE3** hash of their content. Files are read in `(device, inode)` order, which cut cold-scan time by 21% on a two-HDD pool. This is the long phase: hours for two million files on hard disks.
3. **Group.** Collect files with the same hash into duplicate groups, and build directory signatures for twin folders. Seconds to minutes, with a temporary memory peak of about 2.5 KiB per hashed file. Before this phase `dedcom` compares its forecast with free RAM; `--merkle-dirs` brings the peak down to tens or hundreds of MB.

Matching is exact: the same BLAKE3 hash, with no fuzzy or similar-image matching. For an extra check, `--verify` compares each group byte by byte after hashing, which reads every file twice. A file that fails to read is not counted as a duplicate.

Files smaller than 4096 bytes are always skipped (the limit is fixed in code), and `--include-ext jpg,heic` limits a scan to some extensions. ZFS snapshot directories (`.zfs`) and DedupCommando's own quarantine are always skipped. Results are sorted by the space each group would free, and files that are already hardlinks of one another count once. More in the [scanning chapter](@/en/manual/07-scanning.md).

## Resumable scans and the hash cache

Walking and hashing save progress to `dedcom.db` as they go, hashes after every 64 files. After Esc, a reboot or a power cut, the next start offers to resume where the scan stopped. Only grouping starts over, from the saved hashes. A resume needs the same set of roots and keeps the settings stored with the scan ([resume](@/en/manual/07-scanning.md#resume--continue-an-unfinished-scan)).

On a repeat scan, a file at the same path whose size, mtime and ctime are unchanged takes its hash from the cache instead of being read again: tens of seconds per million files. A renamed or moved file is read again, and `--no-hash-reuse` re-hashes everything ([hash cache](@/en/manual/07-scanning.md#hash-cache-hash_cache)).

The database lives in `~/.local/state/dedcom/`, and `--state-dir` moves it; on large pools it can grow to hundreds of MB.

## Two interfaces and an observer mode

- **Commando** (`dedcom`, the default) is a multi-panel navigator in the style of two-panel file managers, with 2–4 panels. Each panel shows a directory, the duplicate groups sorted by savings, the files of the selected group, or the duplicates of the file under the cursor in the neighboring panel.
- **Classic wizard** (`dedcom --classic`) shows one screen at a time: scan configuration, scanning, browser, action review, applying, summary. It suits a first run and terminals without F-keys.
- **Observer** (`dedcom --read-only`) opens the interface with no scans, edits or actions: a second window to watch the operator. Only one writing instance can use a state directory at a time.

## Twin folders

While grouping, DedupCommando builds a signature of each directory's entire contents. Directories with the same signature have identical content, recursively, and appear as **twin folders** in the Commando's directory-group views, with the full path of each copy ([twin folder views](@/en/manual/05-commando.md#directory-twin-views-dirgrouplist--dirgroupfiles)).

## Headless mode for scripts and cron

| Command | What it does |
|---|---|
| `dedcom --scan /tank` | Scan one or more roots and print the first 50 groups |
| `dedcom --stats` | Show statistics for all scans and for the database |
| `dedcom --export-csv dups.csv` | Export the newest scan to CSV; refuses if it has not finished |
| `dedcom --compact-db` | Empty the session trash and compact the database |
| `dedcom --purge-quarantine` | Report the size of the quarantine; with `--yes`, delete it |

Exit codes: 0 success, 1 runtime error, 2 bad arguments. Headless mode never prompts: if an interactive session holds the lock, a writing command exits with an error. It never applies actions either: that needs a person to confirm keepers and marks in the interface ([headless mode](@/en/manual/11-headless.md#applying-actions-from-headless--no)).

A nightly scan from cron:

```sh
# /etc/cron.d/dedcom — every night at 02:00; the path is what `command -v dedcom` prints
0 2 * * * root flock -n /var/lock/dedcom.scan nice -n 19 ionice -c 3 /usr/bin/dedcom --scan /tank >> /var/log/dedcom-scan.log 2>&1
```

Headless `--scan` has no profile flag: every new scan runs on Balanced (two reading threads, normal priority), and only a resume keeps its own profile. On a live host, the `nice -n 19 ionice -c 3` in the line above gives it Idle's priorities from outside ([cron example](@/en/manual/11-headless.md#cron-example-a-nightly-scan-of-tank)).

## Delete duplicate files safely

Finding duplicates only reads. Files change only when you mark them and confirm a plan. In each group you mark one keeper, and each copy gets an action: delete to quarantine, [hardlink or reflink](@/en/hardlink-vs-reflink/_index.md).

"Delete" does not unlink: the file moves to `.dedcom-quarantine/<timestamp>/` at the root of its dataset and can be moved back until you purge it. Before the first change, `dedcom` snapshots every dataset in the batch and aborts the batch if any snapshot fails. Right before each action it checks that the target and the keeper still match the scan, and a mismatch cancels that action.

## On ext4, XFS and Btrfs

On ext4, XFS or Btrfs the walk and hash run as usual, so you can find duplicates and export a report there. Applying changes outside ZFS is refused, because there is no snapshot to roll back to: delete, hardlink and reflink are cancelled with `target file's dataset could not be determined …`. A script of your own built from the CSV skips DedupCommando's checks and snapshot.

## Install

DedupCommando runs on Linux (x86_64 or aarch64, kernel 3.15 or newer). The pre-built packages need glibc 2.39 or newer: Debian 13, Ubuntu 24.04, Proxmox VE 9 or later. ZFS with `zfs` in `PATH` is required for any change (elsewhere dedcom only scans), and `dedcom` typically runs as root. On Debian-family systems, install from the signed APT repository:

```sh
# as root (Proxmox default); on non-root Debian run: sudo -i
curl -fsSL https://dedupcommando.github.io/apt/dedcom-archive-keyring.gpg \
  -o /usr/share/keyrings/dedcom-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/dedcom-archive-keyring.gpg] https://dedupcommando.github.io/apt stable main" \
  | tee /etc/apt/sources.list.d/dedcom.list
apt update && apt install dedcom
```

On other distributions with glibc 2.39 or newer, use the release tarball and [verify it](@/en/verifying-releases.md) first; on older ones, build natively with a Rust toolchain (1.82+).

## Your first scan in five minutes

These steps follow the [quickstart chapter](@/en/manual/04-quickstart.md). The five minutes are your part; the scan itself takes as long as your disks need.

1. Run `dedcom`. On the first start, tick the notice with Space and press Enter.
2. Press **F9** and choose "Configure and start a scan…", or press Shift+F9.
3. Mark the roots with Space. If the host runs VMs or backups, press **G** until the profile reads Idle. Press **S** to start.
4. Wait for the three phases. Esc stops hashing within about a second, even mid-file, and the next start offers to resume. On two hard disks, hashing in Idle runs at about 50–100 MiB/s.
5. In the active panel, press **v** until it shows "groups", largest savings first. Press Tab, then **v** until the next panel shows "group files".
6. Put the cursor on the file to keep, press **o** to open it in a files panel, and mark it as the keeper with **F7**. Open each copy the same way and mark it **F5** (hardlink), **F6** (reflink) or **F8** (delete).
7. Press **F11** (or x). Check the "By type" line and the listed paths; S saves the plan as a shell script for your records. Press **Y** to apply: `Y` re-hashes each file right before its action (the keeper on first use, then by stat), and a saved script compares each file with its keeper byte for byte.
8. The summary names the snapshot and the quarantine. After a week or two of normal use, reclaim the space:

```sh
zfs list -t snapshot | grep dedcom-      # the batch snapshots
zfs destroy tank@dedcom-<timestamp>      # one per dataset
dedcom --purge-quarantine                # shows what would be deleted
dedcom --purge-quarantine --yes          # deletes it; this cannot be undone
```

If something looks wrong before then, move single files back out of the quarantine, or `zfs rollback` to the batch snapshot, which also discards anything else written to that dataset since.

## Next steps

- [Install DedupCommando](@/en/_index.md) and see the other install options.
- Read the [user manual](@/en/manual/_index.md), in particular [Commando](@/en/manual/05-commando.md) and [headless mode](@/en/manual/11-headless.md).
- Read [safety, recovery and limitations](@/en/safety-model.md) before your first apply.
