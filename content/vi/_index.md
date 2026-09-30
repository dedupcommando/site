+++
title = "DedupCommando — Công cụ tìm tệp và thư mục trùng lặp an toàn cho Linux"
description = "CLI và TUI cho Linux tập trung vào an toàn, giúp tìm tệp và thư mục trùng lặp và thu hồi dung lượng bằng hardlink, reflink và quy trình tương thích ZFS. Mã nguồn mở, bản beta."
template = "home.html"
[extra]
lang = "vi"
dir = "ltr"
h1 = "Tìm tệp và thư mục trùng lặp và thu hồi dung lượng — một cách an toàn"
+++

**Beta — v{{ version() }}.** DedupCommando thực hiện các thao tác phá hủy (xóa, hardlink, reflink) trên các tệp thật. Hãy đọc hướng dẫn an toàn trước khi áp dụng bất cứ điều gì và luôn giữ bản sao lưu.

DedupCommando là một công cụ dòng lệnh cho Linux (CLI và TUI) để tìm các **tệp và thư mục giống hệt nhau từng byte** và thu hồi dung lượng bị lãng phí — được thiết kế cho kho lưu trữ **ZFS**, bao gồm cả lưu trữ trên các hệ thống Proxmox VE. An toàn dữ liệu là trên hết: mỗi lô thao tác phá hủy chạy dưới một ảnh chụp (snapshot) ZFS, các tệp “đã xóa” được chuyển vào khu cách ly thay vì bị gỡ bỏ, và nội dung được xác thực lại ngay trước mỗi thao tác.

## An toàn trước tiên

- Một **ảnh chụp ZFS** của mỗi dataset bị ảnh hưởng được tạo trước thao tác đầu tiên; nếu bất kỳ ảnh chụp nào thất bại, toàn bộ lô bị hủy.
- **“Xóa” chuyển tệp vào khu cách ly**, không dùng `unlink` — có thể khôi phục cho đến khi bạn dọn sạch.
- Nội dung được **xác thực lại** (băm lại / stat lại) ngay trước mỗi thao tác; bất kỳ sai khác nào cũng hủy thao tác đó.
- Tệp được công bố theo kiểu nguyên tử bằng `renameat2(RENAME_NOREPLACE)` — không có tranh chấp kiểu “kiểm tra rồi mới đổi tên”.
- **Khóa một phiên bản** ngăn ghi đồng thời; các thao tác chuyển giữa các dataset bị từ chối, không bao giờ âm thầm sao chép rồi xóa.

## Ba cách thu hồi dung lượng

- **Xóa vào khu cách ly** — bỏ một bản trùng nhưng vẫn khôi phục được cho đến khi dọn sạch.
- **Hardlink** — trỏ các bản trùng tới cùng một inode (trong cùng một dataset).
- **Reflink** — nhân bản khối theo cơ chế sao-chép-khi-ghi (CoW) trên ZFS có `block_cloning` (trong cùng một dataset); siêu dữ liệu độc lập, các khối được chia sẻ cho đến khi một tệp thay đổi.

Trong mỗi nhóm, một tệp là bản **giữ lại** (keeper); phần còn lại trở thành liên kết hoặc vào khu cách ly.

## Cách hoạt động

1. **Quét** — duyệt các đường dẫn đã chọn, băm các ứng viên bằng **BLAKE3** (kèm tùy chọn so sánh lại từng byte) và gom các tệp giống hệt nhau. Quá trình quét có thể tiếp tục và được lưu cache để quét lại gần như tức thì.
2. **Xem xét** — duyệt các nhóm trùng lặp trong giao diện **commander** nhiều khung (mặc định) hoặc trình hướng dẫn cổ điển từng bước (`--classic`); đánh dấu keeper và thao tác cho mỗi nhóm. Nó cũng tìm các **“thư mục song sinh”**: các cây thư mục có nội dung giống hệt nhau.
3. **Áp dụng** — xem lại kế hoạch và áp dụng tương tác, hoặc lưu thành script shell. **Bộ điều tiết tài nguyên** (Turbo / Balanced / Idle): trên máy chủ bận, Idle quét bằng một luồng với mức ưu tiên CPU và đĩa thấp nhất (`nice 19`, `ionice idle`).

## Dành cho ZFS, chạy trên Proxmox VE

DedupCommando được thiết kế cho ZFS: ảnh chụp, ranh giới dataset và reflink đều dựa trên nó. Nó đã được kiểm thử trên Proxmox VE 9.1 (OpenZFS 2.3), nơi ZFS có sẵn. Đây là khử trùng lặp **ở cấp độ tệp** — tìm và xóa các tệp trùng — không phải khử trùng lặp ở cấp độ khối tích hợp trong ZFS (`zfs set dedup`), cũng không phải nén.

> Trên các hệ thống tệp không phải ZFS, việc quét vẫn hoạt động, nhưng xóa, hardlink và reflink bị từ chối: DedupCommando chỉ thao tác ở nơi có thể tạo ảnh chụp ZFS trước.

## Yêu cầu

- **Linux**, nhân ≥ 3.15, x86_64 hoặc aarch64; các gói dựng sẵn cần glibc ≥ 2.39 (Debian 13, Ubuntu 24.04, Proxmox VE 9).
- **Cần ZFS để áp dụng thao tác** (an toàn bằng ảnh chụp, phát hiện dataset, reflink); không có ZFS thì chỉ quét; `zfs` trong `PATH`, thường chạy với quyền root.
- Một terminal UTF-8, 256 màu.

## Bắt đầu

**Debian 13 / Proxmox VE 9+** — cài đặt từ kho APT đã ký (tự cập nhật qua `apt upgrade`):

```sh
# as root (Proxmox default); on non-root Debian run: sudo -i
curl -fsSL https://dedupcommando.github.io/apt/dedcom-archive-keyring.gpg \
  -o /usr/share/keyrings/dedcom-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/dedcom-archive-keyring.gpg] https://dedupcommando.github.io/apt stable main" \
  | tee /etc/apt/sources.list.d/dedcom.list
apt update && apt install dedcom
```

Các bản dựng sẵn được đính kèm mỗi bản phát hành GitHub (amd64 và arm64) — tải về, **xác minh**, rồi cài đặt:

```sh
tar xzf dedcom-<version>-<triple>.tar.gz
install -m 755 dedcom-<version>-<triple>/dedcom /usr/local/bin/dedcom
```

Dựng từ mã nguồn: trên hệ thống cũ hơn như Proxmox VE 8 / Debian 12, hãy dựng trực tiếp bằng toolchain Rust (1.82+) ngay trên hệ thống đó; bản dựng từ script Docker của người bảo trì (image `rust:1.95.0`) cần glibc mới hơn và sẽ không chạy được ở đó (xem [CONTRIBUTING](https://github.com/dedupcommando/DedupCommando/blob/main/CONTRIBUTING.md)).

- [Bản phát hành mới nhất](https://github.com/dedupcommando/DedupCommando/releases) · [Mã nguồn trên GitHub](https://github.com/dedupcommando/DedupCommando)
- Chi tiết hơn (bằng tiếng Anh): [trùng lặp trên ZFS](@/en/zfs-file-deduplication/_index.md) · [trên Proxmox VE](@/en/proxmox-ve-duplicate-files/_index.md) · [công cụ tìm tệp trùng lặp trên Linux](@/en/linux-duplicate-file-finder/_index.md) · [hardlink vs reflink](@/en/hardlink-vs-reflink/_index.md) · [an toàn và khôi phục](@/en/safety-and-recovery/_index.md) · [tài liệu](@/en/_index.md)
