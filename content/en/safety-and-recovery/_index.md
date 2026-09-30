+++
title = "Safe Duplicate Deletion and Recovery on ZFS — DedupCommando"
description = "Is it safe to delete duplicate files? How DedupCommando uses ZFS snapshots and a quarantine, and how to restore one file or roll back a whole batch."
template = "home.html"
[extra]
lang = "en"
dir = "ltr"
h1 = "Safety, recovery, and honest limitations"
+++

**Beta (v{{ version() }}).** DedupCommando deletes and relinks real files, so it is built around layered safeguards. This page is a summary: the authoritative reference is [Safety, recovery and limitations](@/en/safety-model.md), and [chapter 3 of the manual](@/en/manual/03-safety.md) walks through every command. Read one of them before your first apply, and keep backups.

## Is it safe to delete duplicate files?

Only if a mistake can be undone, and DedupCommando is designed around that. A scan changes no file contents: the walk, hash and group phases only read. Nothing is deleted or relinked until you review the plan and confirm it with **Y**, and even then a "delete" is a move into a quarantine, made under a fresh ZFS snapshot.

## Layers of protection

Every destructive batch (delete, hardlink or reflink) runs behind these guardrails:

- **A ZFS snapshot of every dataset in the batch**, taken before the first action and named like `tank@dedcom-20260527-143215-512874000-4821-0`. If any snapshot fails, the whole batch is aborted and no action runs; if `zfs` cannot be found, dedcom cancels the action rather than skip the snapshot. Snapshots are never removed automatically ([details](@/en/manual/03-safety.md#1-zfs-snapshot-of-the-action-batch)).
- **Quarantine instead of unlink.** "Delete" moves the file to `<mountpoint>/.dedcom-quarantine/<timestamp>/<path-relative-to-dataset>` at the root of its dataset, keeping permissions, owner and extended attributes. Scans skip that directory, and its space comes back only after you purge it and destroy the batch snapshots ([details](@/en/manual/03-safety.md#2-quarantine-instead-of-unlink)).
- **Revalidation right before each action.** A symlink-swap check and a size check always run, then a content check: in the default Hybrid mode each distinct file is hashed once per batch and re-checked with `stat` between actions, while `--strict-verify` re-hashes target and keeper every time. A mismatch cancels only that action; the rest of the batch continues ([details](@/en/manual/08-actions.md#86-revalidation--the-final-check-before-each-action)).
- **Atomic publish.** Moves use `renameat2(RENAME_NOREPLACE)`, so there is no check-then-rename window on the destination. A hardlink or reflink takes the target's place only after the original is evacuated to quarantine, and if publishing fails, the original is restored automatically ([details](@/en/manual/08-actions.md#85-what-hardlink-and-reflink-share--atomic-publication)).
- **Single-instance lock.** One writer holds `~/.local/state/dedcom/dedcom.lock`; a second instance can open read-only, and headless modes exit with an error instead of prompting. `--force` seizes the lock while the old process keeps running, so use it only when you are certain that process is dead ([details](@/en/manual/03-safety.md#5-single-instance-lock)).
- **Cross-dataset moves are refused**, with a ready-to-run `rsync` hint, because a silent copy-and-delete would lose owner, permissions, ACLs and xattrs, inflate sparse images and break hardlinks ([details](@/en/manual/03-safety.md#6-cross-device--refusal-not-work-around-it-by-copying)).
- **Consent and a resource governor.** A one-time notice must be accepted before first use. The Idle scan profile (one thread, `nice 19` and `ionice idle`) gives a scan the lowest CPU and I/O priority next to running VMs or backups ([details](@/en/manual/07-scanning.md#intensity-profiles-resource-governor)).

## Recovering deleted duplicates: one file or a whole batch

The Summary screen at the end of an apply lists the snapshots it created and the quarantine directory it used. Note both.

### Restore a single file without a rollback

You do not need a rollback to bring back one file. Find it in the quarantine and move it to its original path:

```text
find /tank/.dedcom-quarantine -type f -name 'photo.jpg'
mv /tank/.dedcom-quarantine/20260527-143215-512874000-4821-0/media/photo.jpg /tank/media/photo.jpg
```

If a hardlink now occupies that path, remove it first with `rm /tank/media/photo.jpg` (this removes only the link, not the original in the group), then run the `mv`. See [bringing back one file](@/en/manual/03-safety.md#want-to-bring-back-one-specific-file-from-quarantine).

### Roll back a whole batch

If the whole batch was wrong, roll back each affected dataset to its snapshot:

```text
zfs rollback tank@dedcom-<ts>
zfs rollback tank/media@dedcom-<ts>
```

**Warning:** a rollback returns the **entire** dataset to the moment of the snapshot, so everything written to it since, by any program, is lost too. If anything else wrote to the dataset after the batch, restore the files you need from the quarantine instead; `ls /tank/.dedcom-quarantine/<ts>/` shows what was evacuated ([details](@/en/manual/03-safety.md#apply-the-wrong-thing-the-whole-batch)).

If the dataset has newer snapshots, `zfs rollback` refuses unless given `-r`, which destroys those newer snapshots: list them first with `zfs list -t snapshot <dataset>`.

### If an apply stopped early

Esc stops an apply only after the current action finishes; the process can also be cut off between actions. Either way the snapshots already exist, the originals of finished actions are in quarantine, and the actions not yet reached keep their marks. Press F11 again to finish, or roll back as shown above ([details](@/en/manual/03-safety.md#pull-the-cable-during-apply-between-actions)).

## Purging the quarantine safely

Quarantined files and `dedcom` snapshots keep using pool space until you remove them, and removing them cannot be undone.

1. **Wait.** The manual recommends one to two weeks of normal use, until you are sure the result is stable.
2. **Preview.** `dedcom --purge-quarantine` lists the `.dedcom-quarantine` directory of every detected dataset with its file count and total size. It deletes nothing.
3. **Purge.** `dedcom --purge-quarantine --yes` deletes those directories: a final `rm -rf` of every batch in every dataset, with no selective mode.
4. **Destroy the snapshots separately.** The purge does not touch them. List them with `zfs list -t snapshot | grep dedcom-` and remove each with `zfs destroy`. Space is freed only after both steps.

After a hardlink, the target's own owner, permissions, ACLs and xattrs survive only on the original in quarantine, so a purge removes them for good ([details](@/en/manual/11-headless.md#115---purge-quarantine--clearing-the-quarantine)).

## What the protections do not cover

- **Non-ZFS filesystems.** The walk and hash work, but delete, hardlink and reflink are refused: dedcom acts only where it can take a ZFS snapshot first.
- **The TOCTOU window.** Operations act by path, not through an open file descriptor, so a theoretical check-to-act window exists. It is mitigated by the snapshot, the atomic publish, repeated symlink checks and quarantine-based restore; a full `fd` + `O_NOFOLLOW` closure is deliberately deferred for the single-administrator model the tool targets ([details](@/en/safety-model.md#honest-caveat-toctou)).
- **Changes between the scan and apply.** Revalidation cancels the affected action, but it does not warn you before F11. On large datasets, apply in a maintenance window, when writing workloads are stopped.
- **Snapshots or quarantine you removed yourself.** `zfs destroy` of a snapshot and `rm -rf` of a quarantine directory are irreversible.
- **Disk errors.** Check `zpool status` and run a scrub; on a damaged pool, none of the tool's protections hold.
- **Concurrent ZFS operations.** Do not run an apply at the same time as a `zfs send` of the same dataset.
- **A second operator.** Two writers on one state directory can corrupt the database.
- **Other programs' stores.** Backup repositories, Proxmox Backup Server datastores and virtual machine disks need every file unchanged at its own path. A delete or hardlink inside one can break it, so keep such stores outside the scan roots ([section 8.9 of the manual](@/en/manual/08-actions.md#89-backups-and-other-programs-stores)).
- **Your own scripts.** Deduplicating by hand from an `--export-csv` list loses revalidation and snapshot insurance.

Other limits: DedupCommando is Linux-only (x86_64 or aarch64, kernel 3.15 or newer), there is no headless apply, and it typically runs as root. Hardlink and reflink both work within a single dataset, and reflink also needs OpenZFS 2.2.1 or newer with `zfs_bclone_enabled=1` and the pool's `feature@block_cloning`. See [the limitations](@/en/safety-model.md#limitations) and [what the guardrails do not cover](@/en/manual/03-safety.md#what-the-guardrails-do-not-cover).

## Before your first apply: a checklist

1. Read [chapter 3](@/en/manual/03-safety.md); the manual calls it mandatory before the first real apply.
2. Rehearse on a test pool: `scripts/make-test-pool.sh` from the source repository (it is not in the release tarball) builds a pool named `testpool` on a file image under `$DEDCOM_E2E_ROOT`, without touching real disks, and `teardown-test-pool.sh` removes it ([details](@/en/manual/03-safety.md#a-dry-run-on-a-test-pool-before-the-real-one)).
3. Run as root with `zfs` in `PATH`. Without snapshot privileges the snapshot fails and the batch is cancelled before any file is changed.
4. Check that each root lies entirely on ZFS: `df -T <path>` should report `zfs` ([details](@/en/manual/13-troubleshooting.md#target-files-dataset-could-not-be-determined)).
5. Scan live data with the Idle profile (`G` in the scan configuration cycles to it).
6. Make sure no other `dedcom` is running.
7. Pick a maintenance window: writing workloads stopped, no `zfs send` of the same datasets.
8. In the F11 confirmation, read the **By type** line and the listed paths, which reveal a batch that marked the wrong side of a group, and press **S** to save the plan as a `.sh` audit trail before **Y** ([details](@/en/manual/05-commando.md#f11-confirmation-overlayconfirm)).
9. Start `dedcom --strict-verify` if something else might be editing the files.
10. Afterward, re-scan and compare the two scans with ScanDiff; anything under **Modified** is a red flag ([details](@/en/manual/10-diff-trash.md#where-this-is-useful)).

## Next steps

- [Documentation home](@/en/_index.md): install, first scan and guides.
- [User manual](@/en/manual/_index.md): every chapter, from installation to troubleshooting.
- [Safety, recovery and limitations](@/en/safety-model.md): the authoritative safety reference.
