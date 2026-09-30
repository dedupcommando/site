+++
title = "DedupCommando — Buscador seguro de archivos y carpetas duplicados para Linux"
description = "CLI y TUI para Linux, centrado en la seguridad, que encuentra archivos y carpetas duplicados y recupera espacio con hardlinks, reflinks y flujos compatibles con ZFS. Código abierto, en beta."
template = "home.html"
[extra]
lang = "es"
dir = "ltr"
h1 = "Encuentra archivos y carpetas duplicados y recupera espacio, de forma segura"
+++

**Beta — v{{ version() }}.** DedupCommando realiza operaciones destructivas (borrar, hardlink, reflink) sobre archivos reales. Lee la guía de seguridad antes de aplicar nada y mantén copias de seguridad.

DedupCommando es una herramienta de terminal para Linux (CLI y TUI) que encuentra **archivos y carpetas idénticos byte a byte** y recupera el espacio que desperdician — pensada para almacenamiento en **ZFS**, incluido el alojado en sistemas Proxmox VE. La seguridad de los datos es lo primero: cada lote destructivo se ejecuta bajo una instantánea (snapshot) de ZFS, los archivos «borrados» se mueven a una cuarentena en lugar de eliminarse, y el contenido se vuelve a validar justo antes de cada acción.

## La seguridad primero

- Se toma una **instantánea de ZFS** de cada dataset afectado antes de la primera acción; si falla alguna, se cancela todo el lote.
- **«Borrar» mueve los archivos a una cuarentena**, no usa `unlink` — reversible hasta que la vacíes explícitamente.
- El contenido se **vuelve a validar** (re-hash / re-stat) justo antes de cada acción; cualquier discrepancia cancela esa acción.
- Los archivos se publican de forma atómica con `renameat2(RENAME_NOREPLACE)` — sin la carrera «comprobar y luego renombrar».
- Un **bloqueo de instancia única** impide escrituras concurrentes; los movimientos entre datasets se rechazan, nunca una copia y borrado silenciosos.

## Tres formas de recuperar espacio

- **Borrar a cuarentena** — elimina un duplicado y mantenlo recuperable hasta vaciarla.
- **Hardlink** — apunta los duplicados a un mismo inodo (dentro de un solo dataset).
- **Reflink** — clonado de bloques con copia en escritura (CoW) en ZFS con `block_cloning` (dentro del mismo dataset); metadatos independientes y bloques compartidos hasta que un archivo cambie.

En cada grupo, un archivo es el **conservado** (keeper); el resto se enlaza o va a la cuarentena.

## Cómo funciona

1. **Escanear** — recorre las rutas elegidas, calcula el hash de los candidatos con **BLAKE3** (con una recomparación byte a byte opcional) y agrupa los archivos idénticos. Los escaneos son reanudables y se almacenan en caché para repetirlos casi al instante.
2. **Revisar** — explora los grupos de duplicados en el **commander** multipanel (por defecto) o en un asistente clásico paso a paso (`--classic`); marca un keeper y la acción de cada grupo. También detecta **«carpetas gemelas»**: árboles de directorios con contenido idéntico.
3. **Aplicar** — revisa el plan y aplícalo de forma interactiva, o guárdalo como script de shell. Un **regulador de recursos** (Turbo / Balanced / Idle): en un host ocupado, Idle escanea con un solo hilo y la prioridad de CPU y disco más baja (`nice 19`, `ionice idle`).

## Pensado para ZFS, funciona en Proxmox VE

DedupCommando está diseñado para ZFS: las instantáneas, los límites por dataset y el reflink se apoyan en él. Está probado en Proxmox VE 9.1 (OpenZFS 2.3), donde ZFS está disponible de fábrica. Esto es deduplicación **a nivel de archivo** — encontrar y eliminar archivos duplicados — no la deduplicación a nivel de bloque integrada en ZFS (`zfs set dedup`), ni compresión.

> En sistemas de archivos que no son ZFS el escaneo funciona, pero borrar, hardlink y reflink se rechazan: DedupCommando solo actúa donde puede tomar antes una instantánea de ZFS.

## Requisitos

- **Linux**, kernel ≥ 3.15, x86_64 o aarch64; los paquetes precompilados requieren glibc ≥ 2.39 (Debian 13, Ubuntu 24.04, Proxmox VE 9).
- **ZFS obligatorio para aplicar acciones** (seguridad por instantáneas, detección de datasets, reflink); sin ZFS solo se escanea; `zfs` en el `PATH`, normalmente ejecutado como root.
- Un terminal UTF-8 de 256 colores.

## Empezar

**Debian 13 / Proxmox VE 9+** — instala desde el repositorio APT firmado (se actualiza con `apt upgrade`):

```sh
# as root (Proxmox default); on non-root Debian run: sudo -i
curl -fsSL https://dedupcommando.github.io/apt/dedcom-archive-keyring.gpg \
  -o /usr/share/keyrings/dedcom-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/dedcom-archive-keyring.gpg] https://dedupcommando.github.io/apt stable main" \
  | tee /etc/apt/sources.list.d/dedcom.list
apt update && apt install dedcom
```

Hay binarios precompilados en cada publicación de GitHub (amd64 y arm64) — descarga, **verifica** e instala:

```sh
tar xzf dedcom-<version>-<triple>.tar.gz
install -m 755 dedcom-<version>-<triple>/dedcom /usr/local/bin/dedcom
```

Compilar desde el código fuente: en un sistema más antiguo, como Proxmox VE 8 / Debian 12, compila de forma nativa con un toolchain de Rust (1.82+) en ese mismo sistema; un binario del script Docker de los mantenedores (imagen `rust:1.95.0`) necesita una glibc más reciente y no funcionará allí (ver [CONTRIBUTING](https://github.com/dedupcommando/DedupCommando/blob/main/CONTRIBUTING.md)).

- [Última versión](https://github.com/dedupcommando/DedupCommando/releases) · [Código en GitHub](https://github.com/dedupcommando/DedupCommando)
- Más detalles (en inglés): [duplicados en ZFS](@/en/zfs-file-deduplication/_index.md) · [en Proxmox VE](@/en/proxmox-ve-duplicate-files/_index.md) · [buscador de duplicados en Linux](@/en/linux-duplicate-file-finder/_index.md) · [hardlink vs reflink](@/en/hardlink-vs-reflink/_index.md) · [seguridad y recuperación](@/en/safety-and-recovery/_index.md) · [documentación](@/en/_index.md)
