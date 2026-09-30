+++
title = "Hardlink vs Reflink for Duplicate Files on ZFS — DedupCommando"
description = "Hardlink or reflink? How each one replaces duplicate files on Linux and ZFS, what happens to owner, permissions and timestamps, and which to pick."
template = "home.html"
[extra]
lang = "en"
dir = "ltr"
h1 = "Hardlink vs reflink: replacing duplicate files on ZFS"
+++

Two identical files store the same bytes twice. You can get the space back and still keep a working file at every path: replace the duplicate with a **hardlink** to the other file, or with a **reflink**, a copy that shares the other file's data blocks. The two differ when someone later edits a file, changes its owner or backs it up.

This page explains both on Linux and ZFS, and exactly what DedupCommando does with each. DedupCommando v{{ version() }} is beta software that changes real files: read the [safety model](@/en/safety-model.md) first, and keep backups.

## What a hardlink is

On Linux, a file is an inode: a record of its owner, mode, timestamps, link count and where its data lives. A directory entry is only a name that points to an inode. A hardlink, which is what `ln` creates, is a second name for the same inode, and neither name is the original.

To replace duplicate files with hard links therefore means:

- **One copy of the data.** In a group of N identical files, linking every copy to the one you keep, the keeper, frees the space of N−1 files once the replaced originals are purged and the batch snapshot is destroyed.
- **One set of metadata.** Owner, permissions, ACLs, extended attributes and timestamps are the same at every name.
- **One file to edit.** A write, `chmod` or `chown` through any name shows through all of them.
- **One filesystem.** A hardlink cannot cross filesystems, and every ZFS dataset is a separate filesystem, so both names must be in one dataset.

Deleting one name frees nothing while another remains, so DedupCommando counts files that are already hardlinks of one another as one object.

## What a reflink is

A reflink is a copy that shares storage. The new file has its own inode, and so its own owner, permissions and timestamps, but its data points to the source's blocks. When either file is written later, only the changed blocks are stored anew, and the change stays private to that file: copy-on-write. `cp --reflink=always` makes such a copy, or fails if the filesystem cannot.

## ZFS reflink: block cloning

On ZFS, reflinks come from the `block_cloning` pool feature, which lets several files reference one block. DedupCommando needs OpenZFS 2.2.1 or newer with the module parameter `zfs_bclone_enabled` set to 1, and the pool's `feature@block_cloning` enabled or active; it reads both once, at startup. A plan with a reflink that the host or the pool cannot make is refused before its confirmation opens, with `cannot reflink on this host …` or `cannot reflink on pool <pool> …`, and the marks stay. The scan configuration header shows `block cloning: supported=… enabled=…`.

**A reflink, like a hardlink, stays inside one dataset.** OpenZFS can clone blocks between datasets through `copy_file_range(2)` under some conditions, but DedupCommando clones with the `FICLONE` ioctl, which Linux accepts only within one mounted filesystem. Each ZFS dataset is a filesystem of its own, so the keeper and the duplicate must share a dataset for either action; otherwise the plan is refused before any snapshot, and the target stays as it was. The difference between the two actions is a shared inode versus shared blocks, not where they work.

## What DedupCommando does for each action

In each group of identical files you mark one **keeper** (F7), and each other file can get **hardlink** (F5), **reflink** (F6) or **delete** (F8). A group with marks but no keeper stops the whole plan until you pick one. Nothing changes until you review the plan with F11 and press Y. In every batch:

- Before the first action, every dataset the batch touches is snapshotted. If any snapshot fails, the whole batch is aborted.
- Right before each action, the target and the keeper are checked against the scan: symlink and size every time, content by hash (by default once per batch, with a `stat` check between actions). A mismatch cancels only that action ([revalidation](@/en/manual/08-actions.md#86-revalidation--the-final-check-before-each-action)).
- The replaced file is never unlinked. It moves to `.dedcom-quarantine/<timestamp>/` at the root of its dataset, keeping its directory structure.

### Hardlink (F5)

The link is built under a temporary name next to the target, the original moves to quarantine, and the link is published into the freed name with `renameat2(RENAME_NOREPLACE)`. If that last step fails, the original is put back automatically.

Afterwards the path *is* the keeper's inode. Its owner, permissions, ACL and extended attributes are the keeper's, and so are its timestamps, which live in the same inode. The duplicate's own metadata is not merged: it survives only on the original in quarantine, until the quarantine is purged. Files in different datasets are refused when the plan is built, before any snapshot: `cannot hardlink or reflink across datasets (N marks) — …`. Manual: [hardlink](@/en/manual/08-actions.md#82-hardlink--a-shared-inode-to-the-keeper), [atomic publication](@/en/manual/08-actions.md#85-what-hardlink-and-reflink-share--atomic-publication).

### Reflink (F6)

The same steps, but the replacement is a clone: a new inode that shares the keeper's blocks. A fresh clone would belong to whoever ran the tool, with the umask's mode, so `dedcom` first writes the replaced file's owner, mode, ACL, extended attributes and timestamps onto it. The timestamps are the access and modification times; the kernel sets the change time (ctime) itself whenever metadata is written. If the metadata cannot be carried over, for example without the privilege to hand the file back to its owner, the action is cancelled with `cannot carry over the …` and the file is left untouched. Manual: [reflink](@/en/manual/08-actions.md#83-reflink--an-independent-inode-with-shared-blocks).

### Delete to quarantine (F8)

The file moves to the quarantine on its dataset, and nothing is left at the path. It stays an ordinary file with its permissions, owner and extended attributes, and restoring it is an `mv` back. Manual: [delete](@/en/manual/08-actions.md#81-delete--move-to-quarantine).

## Hardlink vs reflink vs delete to quarantine

| | Hardlink | Reflink | Delete to quarantine |
|---|---|---|---|
| What is left at the path | A second name for the keeper's inode | A separate file sharing the keeper's blocks | Nothing |
| Where it works | Same dataset as the keeper | Same dataset as the keeper, on OpenZFS 2.2.1+ with block cloning on for the host and the pool | Any ZFS dataset |
| Metadata at the path | The keeper's owner, mode, ACL, xattrs and timestamps | The replaced file's owner, mode, ACL, xattrs, atime and mtime | None; the file in quarantine keeps its own |
| A later write through one path | Changes the file at every path | Changes only that file | — |

With all three, the replaced originals stay in the quarantine and in the batch snapshot, so the space comes back only after `dedcom --purge-quarantine --yes` and a `zfs destroy` of the snapshot. The manual suggests waiting a week or two: see [after apply](@/en/manual/08-actions.md#88-after-apply).

## Backups, snapshots, quotas and later edits

**Later edits.** Hardlinked files are one file: an edit meant for one copy changes all of them. Reflinked files diverge block by block, and the other copies stay as they were.

**Backups.** `rsync` copies hard-linked files as separate files unless you pass `-H` (`--hard-links`). With it, or with `tar`, the saving carries into the backup, though some backup software counts each name separately. A reflinked copy is a separate file with its own inode; whether a backup stores its data once depends on the backup tool. Until it is purged, `.dedcom-quarantine` is an ordinary directory, and a file-level backup of the dataset includes it unless you exclude it.

**Snapshots.** DedupCommando never removes its `@dedcom-…` snapshots itself, and each one holds the replaced originals' blocks until you destroy it. Older snapshots of your own that contain the duplicates keep those blocks too.

**Quotas.** ZFS charges a file's space to the owner that `ls -l` shows. A hardlinked path takes the keeper's owner, so after the purge the space counts for the keeper's owner only; a reflinked copy keeps its owner. How cloned blocks count against quotas is not covered in the manual; test on a small dataset if it matters.

## Which one should I pick?

- **Reflink** when the copies may be edited separately later, or must keep their own owner, permissions or timestamps, and the pool has `block_cloning`.
- **Hardlink** when the content will not change and the files share an owner and permissions, for example one user's photo or media archive. It works without block cloning, and hardlink-aware backups keep the saving.
- **Delete to quarantine** for junk that nothing reads by path: old builds, repeated downloads, temporary copies. It is also the only choice when the keeper and the duplicate sit in different datasets.
- **Nothing** when the copies must be able to diverge and reflink is not available.

## Next steps

- [Install DedupCommando](@/en/_index.md) from APT or a release binary.
- Read the [user manual](@/en/manual/_index.md), starting with the [quickstart](@/en/manual/04-quickstart.md) and the [actions chapter](@/en/manual/08-actions.md).
- Read [safety, recovery and limitations](@/en/safety-model.md) before your first apply.
