/* ============================================================================
   DedupCommando — лендинг. Ванильный JS:
   тема (light/dark), симулятор TUI (RU/EN), табы, копирование, мелочи.
   ========================================================================== */
(() => {
  'use strict';

  const d = document;
  const root = d.documentElement;
  root.classList.remove('no-js');
  root.classList.add('js');

  const LANG = (root.lang || 'ru').startsWith('en') ? 'en' : 'ru';
  const RU = LANG === 'ru';
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $  = (s, c = d) => c.querySelector(s);
  const $$ = (s, c = d) => [...c.querySelectorAll(s)];

  /* ------------------------------ тема ---------------------------------- */
  const THEME_KEY = 'dedcom-theme';
  const tbtn = $('#theme-toggle');
  const sysDark = matchMedia('(prefers-color-scheme: dark)');
  const themeNow = () => root.dataset.theme || (sysDark.matches ? 'dark' : 'light');
  const paintTheme = () => {
    if (!tbtn) return;
    const dark = themeNow() === 'dark';
    tbtn.textContent = dark ? '☀' : '☾';
    const label = RU ? (dark ? 'Светлая тема' : 'Тёмная тема')
                     : (dark ? 'Light theme' : 'Dark theme');
    tbtn.setAttribute('aria-label', label);
    tbtn.title = label;
  };
  tbtn?.addEventListener('click', () => {
    root.dataset.theme = themeNow() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(THEME_KEY, root.dataset.theme); } catch { /* приватный режим */ }
    paintTheme();
  });
  sysDark.addEventListener?.('change', paintTheme);
  paintTheme();

  /* ------------------------- числа и склонения --------------------------- */
  const fmtI = (n) => Math.round(n).toLocaleString(RU ? 'ru-RU' : 'en-US');
  const fmt1 = (x) => x.toFixed(1).replace('.', RU ? ',' : '.');
  const plRu = (n, [one, few, many]) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };

  /* ------------------------------ словарь -------------------------------- */
  const L = RU ? {
    GiB: 'ГиБ', MiB: 'МиБ', TiB: 'ТиБ', MiBs: 'МиБ/с',
    task: 'скан пула tank · 14 датасетов', taskLbl: 'ЗАДАЧА',
    profLbl: 'ПРОФИЛЬ', profVal: 'Idle — уступать I/O',
    leftMin: (n) => `осталось ≈ ${n} мин`,
    scanDone: 'скан завершён · группы готовы к просмотру',
    escQuit: 'Esc — пауза · q — выход',
    sFiles: 'Файлов просмотрено', sGroups: 'Групп подтверждено',
    sRead: 'Прочитано', sAwait: 'Ждут проверки хешем',
    sSpeed: 'Скорость', sReclaim: 'Потенциальный возврат',
    logTitle: 'Журнал',
    logs: [
      'открыт пул tank · датасетов: 14 · снапшот: перед каждой партией',
      'чекпойнт восстановлен: продолжаем с 41 %',
      () => `группа #${fmtI(2984)} подтверждена: 4 × ${fmt1(4.1)} ГиБ (iso)`,
      'чекпойнт сохранён → ~/.local/state/dedcom/dedcom.db',
      'чтение: 1 поток · nice 19 · ionice idle ',
      () => `группа #${fmtI(3107)} подтверждена: 6 × ${fmt1(2.3)} ГиБ (iso)`,
    ],
    idleTag: '(профиль Idle)',
    scanHint: 'blake3 → кандидаты → группы',
    toGroups: ' — к группам дубликатов ',
    ftScan: 'dedcom · tank', ftScanR: 'Idle', fbScanL: '/tank · OpenZFS 2.3',
    ckptJust: 'чекпойнт: только что', ckptAgo: 'чекпойнт: 12 с назад',
    gTitle: 'ГРУППЫ ИДЕНТИЧНЫХ ФАЙЛОВ',
    gShown: () => `  ·  показаны 7 из ${fmtI(3107)}`,
    gSort: 'сортировка: вернём ↓',
    hHash: 'хеш', hCnt: 'ф-в', hSize: 'размер', hSave: 'вернём', hFile: 'файл',
    boxGroups: 'Группы', boxFiles: (h) => `Файлы · ${h}`,
    markedLbl: ' отмечено: ',
    markedVal: (n, f) => `${n} ${plRu(n, ['группа', 'группы', 'групп'])} · ${f} ${plRu(f, ['файл', 'файла', 'файлов'])}`,
    toReclaim: ' к возврату: ',
    more: (n) => `… ещё ${n}`,
    keeper: 'эталон — остаётся', others: '   остальные → hardlink',
    verifiedLbl: ' хеш: ', verifiedVal: 'blake3 совпал ✓',
    spaceAct: ' отметить  ', aAct: ' эталон  ', enterAct: ' план → Y',
    grpOf: (n) => `группа ${n}/7`,
    ftGroups: 'dedcom · группы',
    ftGroupsR: () => `${fmtI(3107)} групп · ${fmt1(96.3)} ГиБ`,
    fbGroupsL: 'фильтр: все датасеты', fbGroupsR: 'хеш: blake3',
    stSnap: 'Снапшот', stHash: 'Ре-хеш', stLink: 'Hardlink', stQuar: 'Карантин',
    d2: 'сверка 31 файла перед действием',
    d3: '27 файлов → эталоны, атомарно',
    d4: '27 оригиналов → карантин',
    stWait: '· ждёт', stRun: 'идёт…',
    r1: () => `✓ готово · ${fmt1(3.4)} с`, r2: '✓ 31/31 совпали', r3: '✓ renameat2',
    freed: () => ` ✔ Готово · ${fmt1(44.3)} ГиБ к возврату `,
    undoLbl: '  откат: ', logLbl: '  журнал: ',
    escBack: 'Esc — стоп после текущего действия · снапшот уже сделан',
    modalTitle: 'Дедупликация · 4 группы · 31 файл',
    ftAction: 'dedcom · действие', ftActionR: 'снапшот ✓ · защищено',
    fbActionR: (v) => `после очистки: ${v} ГиБ`,
    fkeys: [['1', 'Помощь'], ['2', 'Скан'], ['3', 'Файл'], ['4', 'Хеш'], ['5', 'Hard'],
            ['6', 'Ref'], ['7', 'Эталон'], ['8', 'Удал.'], ['9', 'Меню'], ['11', 'Выполн.']],
    paused: '⏸ пауза', auto: '▶ автопоказ', statics: 'статичные кадры (reduced motion)',
    egg: ['%cdedcom_ %c— спасибо, что заглянули в консоль.',
          '%cСнапшот уже создан. Шутка. Пока что.'],
  } : {
    GiB: 'GiB', MiB: 'MiB', TiB: 'TiB', MiBs: 'MiB/s',
    task: 'scanning pool tank · 14 datasets', taskLbl: 'TASK',
    profLbl: 'PROFILE', profVal: 'Idle — yield I/O',
    leftMin: (n) => `≈ ${n} min remaining`,
    scanDone: 'scan complete · groups ready for review',
    escQuit: 'Esc — pause · q — quit',
    sFiles: 'Files walked', sGroups: 'Groups confirmed',
    sRead: 'Data read', sAwait: 'Awaiting hash check',
    sSpeed: 'Throughput', sReclaim: 'Potential reclaim',
    logTitle: 'Log',
    logs: [
      'pool tank opened · datasets: 14 · snapshot: before every batch',
      'checkpoint restored: resuming from 41 %',
      () => `group #${fmtI(2984)} confirmed: 4 × ${fmt1(4.1)} GiB (iso)`,
      'checkpoint saved → ~/.local/state/dedcom/dedcom.db',
      'reader: 1 thread · nice 19 · ionice idle ',
      () => `group #${fmtI(3107)} confirmed: 6 × ${fmt1(2.3)} GiB (iso)`,
    ],
    idleTag: '(Idle profile)',
    scanHint: 'blake3 → candidates → groups',
    toGroups: ' — view duplicate groups ',
    ftScan: 'dedcom · tank', ftScanR: 'Idle', fbScanL: '/tank · OpenZFS 2.3',
    ckptJust: 'checkpoint: just now', ckptAgo: 'checkpoint: 12 s ago',
    gTitle: 'IDENTICAL FILE GROUPS',
    gShown: () => `  ·  showing 7 of ${fmtI(3107)}`,
    gSort: 'sort: reclaim ↓',
    hHash: 'hash', hCnt: 'cnt', hSize: 'size', hSave: 'reclaim', hFile: 'file',
    boxGroups: 'Groups', boxFiles: (h) => `Files · ${h}`,
    markedLbl: ' marked: ',
    markedVal: (n, f) => `${n} group${n === 1 ? '' : 's'} · ${f} file${f === 1 ? '' : 's'}`,
    toReclaim: ' to reclaim: ',
    more: (n) => `… ${n} more`,
    keeper: 'keeper — stays', others: '   the rest → hardlink',
    verifiedLbl: ' hash: ', verifiedVal: 'blake3 match ✓',
    spaceAct: ' mark  ', aAct: ' keeper  ', enterAct: ' plan → Y',
    grpOf: (n) => `group ${n}/7`,
    ftGroups: 'dedcom · groups',
    ftGroupsR: () => `${fmtI(3107)} groups · ${fmt1(96.3)} GiB`,
    fbGroupsL: 'filter: all datasets', fbGroupsR: 'hash: blake3',
    stSnap: 'Snapshot', stHash: 'Re-hash', stLink: 'Hardlink', stQuar: 'Quarantine',
    d2: 're-check 31 files before acting',
    d3: '27 files → keepers, atomically',
    d4: '27 originals → quarantine',
    stWait: '· queued', stRun: 'running…',
    r1: () => `✓ done · ${fmt1(3.4)} s`, r2: '✓ 31/31 match', r3: '✓ renameat2',
    freed: () => ` ✔ Done · ${fmt1(44.3)} GiB to reclaim `,
    undoLbl: '  dataset rollback: ', logLbl: '  log: ',
    escBack: 'Esc — stop after the current action · snapshot already taken',
    modalTitle: 'Dedup action · 4 groups · 31 files',
    ftAction: 'dedcom · action', ftActionR: 'snapshot ✓ · protected',
    fbActionR: (v) => `after purge: ${v} GiB`,
    fkeys: [['1', 'Help'], ['2', 'Scan'], ['3', 'File'], ['4', 'Hash'], ['5', 'Hard'],
            ['6', 'Ref'], ['7', 'Keep'], ['8', 'Del'], ['9', 'Menu'], ['11', 'Exec']],
    paused: '⏸ paused', auto: '▶ autoplay', statics: 'static frames (reduced motion)',
    egg: ['%cdedcom_ %c— thanks for checking the console.',
          '%cSnapshot already taken. Kidding. For now.'],
  };
  const lstr = (x) => typeof x === 'function' ? x() : x;

  /* ======================================================================
     СИМУЛЯТОР ТЕРМИНАЛА — экран из «ранов» {t, c}; хелперы держат точную
     ширину каждой строки, поэтому рамки всегда сходятся.
     ====================================================================== */
  const TOTAL = 96;
  const INNER = TOTAL - 2;
  const CROWS = 22;

  const len  = (s) => [...s].length;
  const esc  = (s) => s.replace(/[&<>]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[ch]));
  const rep  = (ch, n) => ch.repeat(Math.max(0, n));
  const padE = (s, n) => s + rep(' ', n - len(s));
  const padS = (s, n) => rep(' ', n - len(s)) + s;
  const R    = (t, c) => ({ t, c });
  const ease = (t) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

  const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const sp = (tick) => SPIN[tick % SPIN.length];

  const runsHtml = (runs) =>
    runs.map((r) => (r.c ? `<span class="${r.c}">${esc(r.t)}</span>` : esc(r.t))).join('');

  function fit(runs, width, padCls) {
    const out = [];
    let used = 0;
    for (const r of runs) {
      const l = len(r.t);
      if (used + l <= width) { out.push(r); used += l; }
      else {
        const keep = width - used;
        if (keep > 0) out.push(R([...r.t].slice(0, keep).join(''), r.c));
        used = width;
        break;
      }
    }
    if (used < width) out.push(R(rep(' ', width - used), padCls));
    return out;
  }

  function line(runs, rowCls) {
    const body = fit(runs, INNER, rowCls).map((r) =>
      rowCls ? R(r.t, r.c ? r.c + ' ' + rowCls : rowCls) : r);
    return runsHtml([R('│', 't-frame'), ...body, R('│', 't-frame')]);
  }
  const blank = () => line([]);

  function cols2(leftRuns, rightRuns) {
    const lw = leftRuns.reduce((n, r) => n + len(r.t), 0);
    const rw = rightRuns.reduce((n, r) => n + len(r.t), 0);
    return line([R('  '), ...leftRuns, R(rep(' ', INNER - 4 - lw - rw)), ...rightRuns, R('  ')]);
  }

  function frameTop(l, r) {
    const fill = TOTAL - 6 - len(l) - len(r) - 2;
    return runsHtml([
      R('┌─ ', 't-frame'), R(l, 't-title'),
      R(' ' + rep('─', fill) + ' ', 't-frame'),
      R(r, 't-dim'), R(' ─┐', 't-frame'),
    ]);
  }
  function frameBot(l, r) {
    const fill = TOTAL - 6 - len(l) - len(r) - 2;
    return runsHtml([
      R('└─ ', 't-frame'), R(l, 't-dim'),
      R(' ' + rep('─', fill) + ' ', 't-frame'),
      R(r, 't-dim'), R(' ─┘', 't-frame'),
    ]);
  }

  function fbar() {
    const runs = [];
    for (const [n, label] of L.fkeys) {
      runs.push(R(padS(n, 3), 't-fnum'), R(' ' + label + ' ', 't-fbtn'));
    }
    return runsHtml(fit(runs, TOTAL));
  }

  function box(title, innerW, rows) {
    const out = [];
    const tfill = innerW - len(title) - 2;
    out.push([R('┌ ', 't-frame'), R(title, 't-cyan'), R(' ' + rep('─', tfill) + '┐', 't-frame')]);
    for (const rowRuns of rows) {
      const body = fit(rowRuns, innerW, rowRuns.rowCls);
      out.push([R('│', 't-frame'),
        ...(rowRuns.rowCls ? body.map((x) => R(x.t, x.c ? x.c + ' ' + rowRuns.rowCls : rowRuns.rowCls)) : body),
        R('│', 't-frame')]);
    }
    out.push([R('└' + rep('─', innerW) + '┘', 't-frame')]);
    return out;
  }

  function joinBoxes(a, b, leftPad) {
    const rows = [];
    const h = Math.max(a.length, b.length);
    const wa = a[0].reduce((n, r) => n + len(r.t), 0);
    for (let i = 0; i < h; i++) {
      const ra = a[i] || [R(rep(' ', wa))];
      const rb = b[i] || [];
      rows.push(line([R(rep(' ', leftPad)), ...ra, R(' '), ...rb, R(' ')]));
    }
    return rows;
  }

  function bar(width, frac) {
    const full = Math.round(width * Math.min(Math.max(frac, 0), 1));
    return [R(rep('█', full), 't-bar'), R(rep('░', width - full), 't-dim')];
  }

  /* ---------------------- данные демо (согласованы) ---------------------- */
  const SZ = (v, u) => (Number.isInteger(v) ? String(v) : fmt1(v)) + ' ' + (u === 'G' ? L.GiB : L.MiB);
  const GROUPS = [
    { h: '0f3ae89c', n: 6,  size: SZ(2.3, 'G'), save: 11.5, name: 'debian-13.1.iso',
      files: ['/tank/data/debian-13.1.iso', '/tank/data/tpl/deb-13.1.iso',
              '/tank/data/dist/deb-13.1.iso', '/tank/data/old/deb-13.1.iso'], more: 2 },
    { h: '7be14402', n: 4,  size: SZ(4.1, 'G'), save: 12.3, name: 'win2022.iso',
      files: ['/tank/data/iso/win2022.iso', '/tank/data/dist/win2022.iso',
              '/tank/data/old/win2022.iso'], more: 1 },
    { h: 'c02d8a77', n: 12, size: SZ(850, 'M'), save: 9.3, name: 'DSC_1041.NEF',
      files: RU
        ? ['/tank/data/фото/DSC_1041.NEF', '/tank/data/exp/DSC_1041.NEF', '/tank/data/nas/DSC_1041.NEF']
        : ['/tank/data/raw/DSC_1041.NEF', '/tank/data/exp/DSC_1041.NEF', '/tank/data/nas/DSC_1041.NEF'],
      more: 9 },
    { h: '33aae0b5', n: 9,  size: SZ(1.4, 'G'), save: 11.2, name: 'office-2024.iso',
      files: ['/tank/data/office-2024.iso', '/tank/data/soft/office24.iso',
              '/tank/data/old/office24.iso'], more: 6 },
    { h: '91cf5dd0', n: 31, size: SZ(120, 'M'), save: 3.6, name: RU ? 'договор.pdf' : 'contract.pdf',
      files: RU
        ? ['/tank/data/сканы/договор.pdf', '/tank/data/2024/договор.pdf', '/tank/data/mail/договор.pdf']
        : ['/tank/data/scans/contract.pdf', '/tank/data/2024/contract.pdf', '/tank/data/mail/contract.pdf'],
      more: 28 },
    { h: 'b7e01284', n: 3,  size: SZ(640, 'M'), save: 1.3, name: 'configs-bak.tar',
      files: ['/tank/data/configs-bak.tar', '/tank/data/old/configs.tar'], more: 1 },
    { h: 'ee407b19', n: 5,  size: SZ(96, 'M'), save: 0.4, name: 'linux-6.12.tar',
      files: ['/tank/data/linux-6.12.tar.xz', '/tank/data/src/linux.tar.xz'], more: 3 },
  ];
  const MARK_N = 4;
  const MARK_SAVE = GROUPS.slice(0, MARK_N).reduce((s, g) => s + g.save, 0);  // 44,3
  const MARK_FILES = GROUPS.slice(0, MARK_N).reduce((s, g) => s + g.n, 0);    // 31

  /* ---------------------------- сцена 1: скан ---------------------------- */
  const LOG_AT = [.02, .1, .34, .52, .68, .86];

  function sceneScan(ms, tick) {
    const p = ease(ms / 8600);
    const done = p >= 0.999;
    const pct = Math.round(p * 100);
    const rows = [];

    rows.push(blank());
    rows.push(cols2(
      [R(padE(L.taskLbl, 8), 't-dim'), R(L.task, 't-txt')],
      [R(padE(L.profLbl, 9), 't-dim'), R(L.profVal, 't-grn')]));
    rows.push(blank());
    rows.push(line([R('  ['), ...bar(56, p), R(']  '),
      R(padS(String(pct), 3) + ' %  ', 't-cyan'),
      R(done ? ' ' : sp(tick), 't-cyan')]));
    rows.push(cols2(
      [R(done ? L.scanDone : L.leftMin(Math.max(1, Math.round(38 * (1 - p)))), done ? 't-grn' : 't-dim')],
      [R(L.escQuit, 't-dim')]));
    rows.push(blank());

    const stat = (l1, v1, l2, v2) => cols2(
      [R(padE(l1, 22), 't-dim'), R(padS(v1, 12), 't-txt')],
      [R(padE(l2, 24), 't-dim'), R(padS(v2, 11), 't-txt')]);
    rows.push(stat(L.sFiles, fmtI(1284503 * p), L.sGroups, fmtI(3107 * p)));
    rows.push(stat(L.sRead, fmt1(2.4 * p) + ' ' + L.TiB, L.sAwait, fmtI(18942 * (1 - p * 0.86))));
    rows.push(stat(L.sSpeed, fmtI(done ? 0 : 396 + 40 * Math.sin(tick / 3)) + ' ' + L.MiBs,
                   L.sReclaim, fmt1(96.3 * p) + ' ' + L.GiB));
    rows.push(blank());

    const stamps = ['14:01:52', '14:01:58', '14:02:07', '14:02:11', '14:02:14', '14:02:19'];
    const shown = [];
    LOG_AT.forEach((at, i) => {
      if (p < at) return;
      const text = lstr(L.logs[i]);
      const runs = [R(stamps[i] + '  ', 't-dim')];
      if (i === 1) runs.push(R(text, 't-cyan'));
      else if (i === 4) runs.push(R(text, 't-amb'), R(L.idleTag, 't-dim'));
      else runs.push(R(text, 't-txt'));
      shown.push(runs);
    });
    while (shown.length < 6) shown.push([]);
    for (const r of box(L.logTitle, 88, shown.slice(-6))) rows.push(line([R('  '), ...r]));

    rows.push(blank());
    rows.push(done
      ? line([R(' Enter ', 't-inv'), R(L.toGroups, 't-grn'), R(tick % 8 < 4 ? '▌' : ' ', 't-grn')])
      : line([R('  ' + L.scanHint, 't-dim')]));

    return frameScene(rows, L.ftScan, L.ftScanR, L.fbScanL, done ? L.ckptJust : L.ckptAgo);
  }

  /* --------------------------- сцена 2: группы --------------------------- */
  function sceneGroups(ms, tick) {
    const sel = Math.min(Math.floor(ms / 1100), MARK_N);
    const markedN = Math.min(
      GROUPS.slice(0, MARK_N).filter((_, i) => ms > i * 1100 + 620).length, MARK_N);
    const saveSum = GROUPS.slice(0, markedN).reduce((s, g) => s + g.save, 0);
    const filesSum = GROUPS.slice(0, markedN).reduce((s, g) => s + g.n, 0);

    const rows = [];
    rows.push(blank());
    rows.push(cols2(
      [R(L.gTitle, 't-title'), R(lstr(L.gShown), 't-dim')],
      [R(L.gSort, 't-dim')]));
    rows.push(blank());

    const leftRows = [];
    const hdr = '  ' + padE(L.hHash, 8) + '  ' + padS(L.hCnt, 3) + '  ' +
                padS(L.hSize, 9) + '  ' + padS(L.hSave, 9) + '  ' + L.hFile;
    leftRows.push([R(hdr, 't-dim')]);
    GROUPS.forEach((g, i) => {
      const marked = i < markedN;
      const row = [
        R(marked ? '✓' : ' ', 't-mark'), R(' '),
        R(g.h, marked ? 't-grn' : 't-cyan'), R('  '),
        R(padS(String(g.n), 3), 't-txt'), R('  '),
        R(padS(g.size, 9), 't-txt'), R('  '),
        R(padS(fmt1(g.save) + ' ' + L.GiB, 9), marked ? 't-grn' : 't-txt'), R('  '),
        R(padE(g.name, 15), 't-dim'),
      ];
      if (i === sel) row.rowCls = 't-sel';
      leftRows.push(row);
    });
    leftRows.push([]);
    leftRows.push([R(L.markedLbl, 't-dim'), R(L.markedVal(markedN, filesSum), 't-txt')]);
    leftRows.push([R(L.toReclaim, 't-dim'), R(fmt1(saveSum) + ' ' + L.GiB, 't-grn')]);
    leftRows.push([]);

    const g = GROUPS[Math.min(sel, GROUPS.length - 1)];
    const rightRows = [];
    g.files.forEach((f, i) => {
      rightRows.push(i === 0
        ? [R(' ● ', 't-grn'), R(padE(f, 29), 't-txt')]
        : [R('   '), R(padE(f, 29), 't-dim')]);
    });
    if (g.more) rightRows.push([R('   '), R(lstr(() => L.more(g.more)), 't-dim')]);
    rightRows.push([]);
    rightRows.push([R(' ● ', 't-grn'), R(L.keeper, 't-dim')]);
    rightRows.push([R(L.others, 't-dim')]);
    rightRows.push([]);
    rightRows.push([R(L.verifiedLbl, 't-dim'), R(L.verifiedVal, 't-grn')]);
    while (rightRows.length < 11) rightRows.push([]);

    while (leftRows.length < 12) leftRows.push([]);
    const A = box(L.boxGroups, 54, leftRows.slice(0, 12));
    const B = box(L.boxFiles(g.h), 33, rightRows.slice(0, 12));
    rows.push(...joinBoxes(A, B, 1));

    rows.push(blank());
    rows.push(cols2(
      [R('Space', 't-fbtn'), R(L.spaceAct, 't-dim'), R('F7', 't-fbtn'), R(L.aAct, 't-dim'),
       R('F11', markedN === MARK_N ? 't-inv' : 't-fbtn'), R(L.enterAct, markedN === MARK_N ? 't-grn' : 't-dim'),
       R(markedN === MARK_N && tick % 8 < 4 ? ' ▌' : '  ', 't-grn')],
      [R(L.grpOf(Math.min(sel + 1, 7)), 't-dim')]));

    return frameScene(rows, L.ftGroups, lstr(L.ftGroupsR), L.fbGroupsL, L.fbGroupsR);
  }

  /* -------------------------- сцена 3: действие -------------------------- */
  function sceneAction(ms, tick) {
    const st = (from, to) => ms < from ? 0 : ms >= to ? 2 : 1;
    const sSnap = st(200, 1600), sHash = st(1600, 3400), sLink = st(3400, 4700), sQuar = st(4700, 4800);
    const p = Math.min(ms / 5200, 1);
    const rehashN = Math.round(Math.min(Math.max((ms - 1600) / 1800, 0), 1) * MARK_FILES);

    const status = (s, doneRuns) => s === 0 ? [R(L.stWait, 't-dim')]
      : s === 1 ? [R(sp(tick) + ' ' + L.stRun, 't-cyan')] : doneRuns;

    const m = [];
    m.push([]);
    m.push([R('  1  ', 't-dim'), R(padE(L.stSnap, 11)), R(padE('tank/data@dedcom-20260807-1402', 33), 't-txt'),
            ...status(sSnap, [R(lstr(L.r1), 't-grn')])]);
    m.push([R('  2  ', 't-dim'), R(padE(L.stHash, 11)), R(padE(L.d2, 33), 't-txt'),
            ...status(sHash, [R(L.r2, 't-grn')]),
            ...(sHash === 1 ? [R(`  ${rehashN}/${MARK_FILES}`, 't-dim')] : [])]);
    m.push([R('  3  ', 't-dim'), R(padE(L.stLink, 11)), R(padE(L.d3, 33), 't-txt'),
            ...status(sLink, [R(L.r3, 't-grn')])]);
    m.push([R('  4  ', 't-dim'), R(padE(L.stQuar, 11)), R(padE(L.d4, 33), 't-txt'),
            ...status(sQuar, [R('✓', 't-grn')])]);
    m.push([]);
    m.push([R('  ['), ...bar(52, p), R(']  '), R(padS(Math.round(p * 100) + ' %', 5), 't-cyan')]);
    m.push([]);
    m.push(ms > 5300 ? [R(' '), R(lstr(L.freed), 't-inv')] : []);
    m.push(ms > 5650 ? [R(L.undoLbl, 't-dim'), R('zfs rollback tank/data@dedcom-20260807-1402', 't-amb')] : []);
    m.push(ms > 5950 ? [R(L.logLbl, 't-dim'), R('~/.local/state/dedcom/dedcom.log', 't-txt')] : []);
    m.push([]);

    const rows = [];
    rows.push(blank()); rows.push(blank()); rows.push(blank());
    for (const r of box(L.modalTitle, 68, m)) rows.push(line([R(rep(' ', 12)), ...r]));
    rows.push(blank());
    rows.push(line([R(rep(' ', 12)), R(L.escBack, 't-dim')]));

    return frameScene(rows, L.ftAction, L.ftActionR, L.fbScanL, L.fbActionR(fmt1(MARK_SAVE * p)));
  }

  function frameScene(contentRows, tl, tr, bl, br) {
    while (contentRows.length < CROWS) contentRows.push(blank());
    return [frameTop(tl, tr), ...contentRows.slice(0, CROWS), frameBot(bl, br), fbar()];
  }

  /* ------------------------------- движок -------------------------------- */
  const screen = $('#term-screen');
  if (screen) {
    const SCENES = [
      { fn: sceneScan,   len: 9500 },
      { fn: sceneGroups, len: 9200 },
      { fn: sceneAction, len: 9200 },
    ];
    const tabs = $$('.term-tab');
    const statusEl = $('.term-status');
    let si = 0, elapsed = 0, last = 0, tick = 0, paused = false, visible = true;

    const setTab = () => tabs.forEach((t, i) => t.setAttribute('aria-selected', String(i === si)));
    const draw = () => { screen.innerHTML = SCENES[si].fn(elapsed, tick).join('\n'); };

    function frame(now) {
      if (!paused && visible) {
        elapsed += Math.min(now - last, 200);
        tick = Math.floor(elapsed / 90) + si * 7;
        if (elapsed >= SCENES[si].len) { si = (si + 1) % SCENES.length; elapsed = 0; setTab(); }
        draw();
      }
      last = now;
    }

    function switchTo(i) {
      const go = () => { si = i; elapsed = 0; setTab(); draw(); };
      if (!REDUCED && document.startViewTransition) document.startViewTransition(go);
      else go();
    }
    tabs.forEach((t, i) => t.addEventListener('click', () => switchTo(i)));

    if (REDUCED) {
      const FINAL = [8600, 5200, 6400];
      const drawStatic = () => { screen.innerHTML = SCENES[si].fn(FINAL[si], 4).join('\n'); };
      si = 1; setTab(); drawStatic();
      tabs.forEach((t, i) => t.addEventListener('click', () => { si = i; setTab(); drawStatic(); }));
      if (statusEl) statusEl.textContent = L.statics;
    } else {
      const term = $('.term');
      term.addEventListener('pointerenter', () => { paused = true; if (statusEl) statusEl.textContent = L.paused; });
      term.addEventListener('pointerleave', () => { paused = false; if (statusEl) statusEl.textContent = L.auto; });
      new IntersectionObserver((e) => { visible = e[0].isIntersecting; })
        .observe($('.term-viewport'));
      last = performance.now();
      setTab(); draw();
      setInterval(() => frame(performance.now()), 90);
    }
  }

  /* --------------------------- остальная страница ------------------------ */

  /* скроллспай навигации */
  const navLinks = $$('.nav-links a');
  if (navLinks.length && 'IntersectionObserver' in window) {
    const map = new Map(navLinks.map((a) => [a.hash.slice(1), a]));
    const spy = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        navLinks.forEach((a) => a.removeAttribute('aria-current'));
        const a = map.get(e.target.id);
        if (a) a.setAttribute('aria-current', 'true');
      }
    }, { rootMargin: '-38% 0px -55% 0px' });
    map.forEach((_, id) => { const s = d.getElementById(id); if (s) spy.observe(s); });
  }

  /* кнопки «копировать» */
  $$('.copy').forEach((btn) => {
    const idle = btn.textContent;
    btn.addEventListener('click', async () => {
      const pre = $(btn.dataset.copy);
      if (!pre) return;
      const text = pre.innerText.replace(/\n{2,}/g, '\n').trim();
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; }
      catch {
        const ta = d.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        d.body.append(ta); ta.select();
        try { ok = d.execCommand('copy'); } catch { /* ну нет так нет */ }
        ta.remove();
      }
      btn.textContent = ok ? (RU ? 'скопировано ✓' : 'copied ✓') : (RU ? 'не вышло' : 'failed');
      btn.classList.toggle('ok', ok);
      setTimeout(() => { btn.textContent = idle; btn.classList.remove('ok'); }, 1800);
    });
  });

  /* мобильное меню (popover + фолбэк) */
  const mnav = $('#mobile-menu');
  const burger = $('.burger');
  if (mnav && burger) {
    const hasPopover = 'showPopover' in HTMLElement.prototype;
    if (!hasPopover) burger.addEventListener('click', () => mnav.classList.toggle('open'));
    $$('a', mnav).forEach((a) => a.addEventListener('click', () => {
      if (hasPopover) mnav.hidePopover(); else mnav.classList.remove('open');
    }));
  }

  /* год + пасхалка */
  const y = $('#year'); if (y) y.textContent = new Date().getFullYear();
  console.log(L.egg[0] + '\n' + L.egg[1],
    'color:#b23c17;font-weight:700;font-family:monospace;font-size:14px',
    'color:inherit', 'color:#888');
})();
