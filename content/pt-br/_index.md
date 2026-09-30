+++
title = "DedupCommando — Localizador seguro de arquivos e pastas duplicados para Linux"
description = "CLI e TUI para Linux com foco em segurança que encontra arquivos e pastas duplicados e recupera espaço com hardlinks, reflinks e fluxos compatíveis com ZFS. Código aberto, em beta."
template = "home.html"
[extra]
lang = "pt-BR"
dir = "ltr"
h1 = "Encontre arquivos e pastas duplicados e recupere espaço, com segurança"
+++

**Beta — v{{ version() }}.** O DedupCommando executa operações destrutivas (excluir, hardlink, reflink) em arquivos reais. Leia o guia de segurança antes de aplicar qualquer coisa e mantenha backups.

O DedupCommando é uma ferramenta de terminal para Linux (CLI e TUI) que encontra **arquivos e pastas idênticos byte a byte** e recupera o espaço que eles desperdiçam — feita para armazenamento em **ZFS**, incluindo o hospedado em sistemas Proxmox VE. A segurança dos dados vem primeiro: cada lote destrutivo é executado sob um snapshot do ZFS, os arquivos "excluídos" vão para uma quarentena em vez de serem removidos, e o conteúdo é revalidado imediatamente antes de cada ação.

## Segurança em primeiro lugar

- Um **snapshot do ZFS** de cada dataset afetado é criado antes da primeira ação; se algum falhar, todo o lote é cancelado.
- **"Excluir" move os arquivos para uma quarentena**, não usa `unlink` — reversível até você esvaziá-la explicitamente.
- O conteúdo é **revalidado** (re-hash / re-stat) logo antes de cada ação; qualquer divergência cancela aquela ação.
- Os arquivos são publicados de forma atômica com `renameat2(RENAME_NOREPLACE)` — sem a corrida "verificar e depois renomear".
- Um **bloqueio de instância única** impede escritas concorrentes; movimentações entre datasets são recusadas, nunca uma cópia e exclusão silenciosas.

## Três formas de recuperar espaço

- **Excluir para a quarentena** — remova um duplicado mantendo-o recuperável até esvaziá-la.
- **Hardlink** — aponte os duplicados para um mesmo inode (dentro de um único dataset).
- **Reflink** — clone de blocos com cópia na escrita (CoW) no ZFS com `block_cloning` (dentro do mesmo dataset); metadados independentes e blocos compartilhados até um arquivo mudar.

Em cada grupo, um arquivo é o **mantido** (keeper); o restante vira link ou vai para a quarentena.

## Como funciona

1. **Escanear** — percorre os caminhos escolhidos, calcula o hash dos candidatos com **BLAKE3** (com uma recomparação byte a byte opcional) e agrupa os arquivos idênticos. Os escaneamentos são retomáveis e ficam em cache para repetições quase instantâneas.
2. **Revisar** — navegue pelos grupos de duplicados no **commander** multipainel (padrão) ou em um assistente clássico passo a passo (`--classic`); marque um keeper e a ação de cada grupo. Ele também encontra **"pastas gêmeas"**: árvores de diretórios com conteúdo idêntico.
3. **Aplicar** — revise o plano e aplique-o de forma interativa, ou salve-o como script de shell. Um **regulador de recursos** (Turbo / Balanced / Idle): em um host ocupado, o Idle escaneia com uma única thread e a menor prioridade de CPU e disco (`nice 19`, `ionice idle`).

## Feito para ZFS, roda em Proxmox VE

O DedupCommando foi projetado para ZFS: snapshots, limites por dataset e reflink se apoiam nele. Foi testado no Proxmox VE 9.1 (OpenZFS 2.3), onde o ZFS está disponível de fábrica. Isto é deduplicação **em nível de arquivo** — encontrar e remover arquivos duplicados — não a deduplicação em nível de bloco embutida no ZFS (`zfs set dedup`), nem compressão.

> Em sistemas de arquivos que não são ZFS o escaneamento funciona, mas excluir, hardlink e reflink são recusados: o DedupCommando só age onde pode criar antes um snapshot do ZFS.

## Requisitos

- **Linux**, kernel ≥ 3.15, x86_64 ou aarch64; os pacotes pré-compilados exigem glibc ≥ 2.39 (Debian 13, Ubuntu 24.04, Proxmox VE 9).
- **ZFS obrigatório para aplicar ações** (segurança por snapshots, detecção de datasets, reflink); sem ZFS, só escaneamento; `zfs` no `PATH`, normalmente executado como root.
- Um terminal UTF-8 de 256 cores.

## Começar

**Debian 13 / Proxmox VE 9+** — instale pelo repositório APT assinado (atualizações via `apt upgrade`):

```sh
# as root (Proxmox default); on non-root Debian run: sudo -i
curl -fsSL https://dedupcommando.github.io/apt/dedcom-archive-keyring.gpg \
  -o /usr/share/keyrings/dedcom-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/dedcom-archive-keyring.gpg] https://dedupcommando.github.io/apt stable main" \
  | tee /etc/apt/sources.list.d/dedcom.list
apt update && apt install dedcom
```

Há binários pré-compilados em cada release do GitHub (amd64 e arm64) — baixe, **verifique** e instale:

```sh
tar xzf dedcom-<version>-<triple>.tar.gz
install -m 755 dedcom-<version>-<triple>/dedcom /usr/local/bin/dedcom
```

Compilação a partir do código-fonte: em um sistema mais antigo, como Proxmox VE 8 / Debian 12, compile nativamente com um toolchain Rust (1.82+) nesse mesmo sistema; um binário gerado pelo script Docker dos mantenedores (imagem `rust:1.95.0`) exige uma glibc mais nova e não vai rodar ali (veja [CONTRIBUTING](https://github.com/dedupcommando/DedupCommando/blob/main/CONTRIBUTING.md)).

- [Última versão](https://github.com/dedupcommando/DedupCommando/releases) · [Código no GitHub](https://github.com/dedupcommando/DedupCommando)
- Mais detalhes (em inglês): [duplicados no ZFS](@/en/zfs-file-deduplication/_index.md) · [no Proxmox VE](@/en/proxmox-ve-duplicate-files/_index.md) · [localizador de duplicados no Linux](@/en/linux-duplicate-file-finder/_index.md) · [hardlink vs reflink](@/en/hardlink-vs-reflink/_index.md) · [segurança e recuperação](@/en/safety-and-recovery/_index.md) · [documentação](@/en/_index.md)
