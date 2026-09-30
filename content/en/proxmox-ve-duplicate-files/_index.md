+++
title = "File deduplication on Proxmox VE ZFS storage — DedupCommando"
description = "DedupCommando for storage hosted on Proxmox VE systems: find duplicate files on ZFS datasets and reclaim space under snapshots, with an Idle scan profile."
template = "home.html"
[extra]
lang = "en"
dir = "ltr"
h1 = "Duplicate files on Proxmox VE: file-level deduplication for ZFS storage"
+++

**Beta — v{{ version() }}.** DedupCommando changes real files. Try the first batch on non-critical data, keep backups, and read the [safety model](@/en/safety-model.md) before you apply anything.

Proxmox VE hosts usually keep their data on ZFS, and over the years the same ISO images, container templates, media and shared files pile up in more than one place. DedupCommando finds those byte-for-byte duplicates on the host's datasets and reclaims the space by hardlink, block-cloned reflink or delete to quarantine — each batch under a ZFS snapshot.

It is an independent tool, not a Proxmox plugin: it does not modify Proxmox VE and works only on the files in your datasets. It is tested on Proxmox VE 9.1 with OpenZFS 2.3.

## Not the same as backup deduplication

Proxmox Backup Server deduplicates backups: it splits them into chunks identified by their SHA-256 checksum and reuses those chunks across the backup snapshots in a datastore ([PBS technical overview](https://pbs.proxmox.com/docs/technical-overview.html)). That happens inside the backup server.

This page is about something else: duplicate files on the host's own ZFS storage — ISO and template stores, media libraries, and datasets you share with VMs and containers. It is not ZFS's block-level `dedup` property either; [file-level deduplication on ZFS](@/en/zfs-file-deduplication/_index.md) explains the difference.

## Install on Proxmox VE 9

Install `dedcom` from the project's signed APT repository:

```sh
# as root (Proxmox default); on non-root Debian run: sudo -i
curl -fsSL https://dedupcommando.github.io/apt/dedcom-archive-keyring.gpg \
  -o /usr/share/keyrings/dedcom-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/dedcom-archive-keyring.gpg] https://dedupcommando.github.io/apt stable main" \
  | tee /etc/apt/sources.list.d/dedcom.list
apt update && apt install dedcom
```

After that, `apt upgrade` keeps it current. The packages need glibc 2.39 or newer, which means Proxmox VE 9 or later: on Proxmox VE 8 (Debian 12) the install stops on an unmet `libc6` dependency. There, build natively with a Rust toolchain (1.82+) on the host itself; a binary from the maintainers' Docker wrapper (`rust:1.95.0` image) needs a newer glibc and will not run there. The [installation chapter](@/en/manual/02-install.md#install-from-the-apt-repository-debian--proxmox-ve) also covers the release tarball and how to [verify it](@/en/verifying-releases.md).

## Run it as root, over SSH or in the web shell

Run `dedcom` as root on the host, the Proxmox default. As an unprivileged user it cannot take ZFS snapshots without `zfs allow` or sudo, and a batch whose snapshot fails is cancelled before any file is changed. It is a terminal program that needs a UTF-8, 256-color terminal, so an SSH session works as well as the Proxmox web shell.

The web shell (xterm.js) does not pass Shift with F-keys, so press the backtick first: `` ` `` then F9 does what Shift+F9 does. If F11 toggles fullscreen instead of reaching dedcom, press `x` to execute the marked actions ([troubleshooting](@/en/manual/13-troubleshooting.md#shiftf-works-in-a-local-terminal-but-not-in-the-proxmox-web-shell)).

Only one instance writes at a time; a second window can watch with `dedcom --read-only`.

## Scan gently: the Idle profile

A scan reads every candidate file, and on a pool with running VMs or backups the manual makes the **Idle** profile mandatory. It caps the scan at one read thread, at the lowest CPU and I/O priority:

| Profile | Read threads | Priority |
|---|---|---|
| Turbo | all cores (`nproc`) | default |
| Balanced (default) | 2 | default |
| Idle | 1 | `nice 19` + `ionice idle` |

Press `G` in the scan configuration to cycle Turbo → Balanced → Idle. The profile is saved with the scan, so a resumed scan keeps it; a new headless scan always starts on Balanced. If guests still slow down, press Esc: hashing stops within about a second, and the scan keeps its progress and can resume later ([intensity profiles](@/en/manual/07-scanning.md#intensity-profiles-resource-governor)).

## What to leave out of a scan

Leave other programs' stores out of the scan roots: a Proxmox Backup Server datastore, a virtual machine's disk, a restic, borg or kopia repository. Such a store needs every file at its own path with its own content. A delete inside it breaks it at once, and a hardlink makes two copies one file, so a program that later writes in place, as VM disks and databases do, changes both. A scan root takes in every dataset mounted below it and there is no way to exclude a path, so the roots are the only fence. The manual covers this in [section 8.9](@/en/manual/08-actions.md#89-backups-and-other-programs-stores).

What else the manual says points the same way:

- **Stop the writers first.** Revalidation cancels an action whose file changed before it, but a program that keeps the file open writes on into the original in quarantine; the manual advises applying in a maintenance window, with write workloads stopped.
- **A hardlink shares every later write.** Both paths are one inode, so a change through either shows in both. If copies are meant to diverge, use reflink or leave them alone.
- **Delete takes the file off its path.** Use it only when no program expects to find the file there.
- **No apply during a `zfs send` of the same dataset.** The manual warns that send and receive can conflict with the batch ([what the guardrails do not cover](@/en/manual/03-safety.md#what-the-guardrails-do-not-cover)).

Taken together: point dedcom at folders whose files sit still, such as ISO and template stores, media and file shares, and leave out anything guests or backup jobs keep writing.

## Walkthrough: scan, review, apply

These are the keys of the default commander interface, as in the [quickstart](@/en/manual/04-quickstart.md):

1. **Start.** Run `dedcom`. On the first run, tick the notice with Space and press Enter.
2. **Open the scan wizard.** F9 → "Configure and start a scan…" → Enter.
3. **Choose roots and the profile.** Space on each dataset to scan, `G` until the intensity reads Idle, `S` to start.
4. **Wait.** The scan walks, hashes and groups. Esc stops it cleanly, and the next start offers to resume.
5. **Open the groups.** Press `v` twice in a panel for "groups", largest savings first. Tab to the next panel and press `v` until it shows "group files".
6. **Mark.** In "group files", put the cursor on the file to keep and press `o`: its folder opens in a third panel, cursor on the file (three panels need a window at least 108 columns wide). Press F7 to make it the keeper. Go back with ←, move to a copy, press `o`, then → and mark it: F5 hardlink, F6 reflink or F8 delete to quarantine. Repeat for each copy ([step 8](@/en/manual/04-quickstart.md#step-8-mark-a-keeper-and-hardlinks)).
7. **Review.** F11 or `x` opens the confirmation. Check the "By type" line and the listed paths; Tab shows the full shell script, and `S` saves it as a `.sh` file. Enter does nothing here.
8. **Apply.** `Y` takes the snapshots, then revalidates and applies each action. The Summary lists the snapshots, the quarantine folder and the commands that free the space.

Hardlink and reflink work only within one dataset; for copies in different datasets, delete to quarantine is the option. `dedcom --classic` runs the same steps as a one-screen-at-a-time wizard — Enter sets the keeper, `h`, `c` and `d` mark, `r` reviews — which also suits terminals without F-keys ([classic browser](@/en/manual/06-classic.md#65-browser--viewing-groups-and-marking-actions)).

## Snapshots and quarantine on a live host

Before the first action, dedcom snapshots every dataset in the batch (`<dataset>@dedcom-<timestamp>`); if any snapshot fails, nothing runs. Replaced and deleted files go to `.dedcom-quarantine/<timestamp>/` at the root of their dataset, with owner, permissions and xattrs intact.

- **Undo one file:** `mv` it back out of the quarantine. If a hardlink now holds the path, remove the link first.
- **Undo a batch:** `zfs rollback <dataset>@dedcom-<timestamp>`. On a busy host prefer the quarantine: rollback reverts the whole dataset, including everything guests and services wrote to it since.
- **Free the space** after a week or two of normal operation. Snapshots are never removed automatically:

```sh
zfs list -t snapshot | grep dedcom-    # what the batches left behind
zfs destroy tank@dedcom-<timestamp>    # irreversible: one per dataset
dedcom --purge-quarantine              # reports what it would delete
dedcom --purge-quarantine --yes        # irreversible: empties every quarantine
```

## Scans from cron

`dedcom --scan <path>` runs without the interface, so it fits cron. It only scans; applying is interactive, with `Y` in the confirmation. The manual has a ready cron line with `flock`, `nice` and `ionice` ([headless](@/en/manual/11-headless.md#cron-example-a-nightly-scan-of-tank)); point it at the path `command -v dedcom` prints and keep the `nice -n 19 ionice -c 3`: a new `--scan` always runs on Balanced.

## Next steps

- [Install DedupCommando](@/en/_index.md) and run a first scan.
- [Read the user manual](@/en/manual/_index.md), starting with the [quickstart](@/en/manual/04-quickstart.md).
- [Safety, recovery and limitations](@/en/safety-model.md) — read it before the first apply.
