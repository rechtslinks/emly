/* Emly – reports.js (Dev B „Auswertung“, Jonas)
 * Emly.stats  – reine Auswertung, liest ausschließlich über Emly.store.
 * Screen 'berichte' – KPI-Karten, 4 Inline-SVG-Charts, Muster-Aussagen, PDF-Button.
 * Zahlen für Screen und PDF kommen aus denselben Funktionen (summary + fmt) → identisch.
 */
(function () {
  'use strict';
  const Emly = window.Emly;
  const U = Emly.util;

  /* =====================================================================
   * Formatierung (gemeinsam für Screen & PDF)
   * ===================================================================== */
  const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fin = v => (typeof v === 'number' && isFinite(v) ? v : 0);
  const fmt = {
    int: v => nf0.format(Math.round(fin(v))),
    dec1: v => nf1.format(fin(v)),
    ml: v => nf0.format(Math.round(fin(v))) + '\u00A0ml',
    /** Liter mit 1 Nachkommastelle, z. B. „8,6 l“ */
    l: v => nf1.format(fin(v) / 1000) + '\u00A0l',
    pct: v => nf0.format(Math.round(fin(v))) + '\u00A0%',
    /** „2 von 6“ */
    of: (a, b) => nf0.format(a) + ' von ' + nf0.format(b),
    days: n => nf0.format(n) + (n === 1 ? ' Tag' : ' Tage'),
    /** Dativ: „an 3 Tagen“ */
    daysDat: n => nf0.format(n) + (n === 1 ? ' Tag' : ' Tagen'),
    nights: n => nf0.format(n) + (n === 1 ? ' Nacht' : ' Nächte'),
    nightToilet: nb => !nb || typeof nb.toilet !== 'number' ? '–' : nb.toilet === 0 ? 'nein' : nb.toilet === 1 ? '1×' : '2× oder öfter',
    bed: nb => !nb || !nb.bed ? '–' : nb.bed === 'trocken' ? 'trocken' : 'nicht ganz trocken',
    training: t => t === true ? 'ja' : t === false ? 'nein' : '–'
  };

  const DGE_ML = 1170;
  const DRINK_LABEL = { wasser: 'Wasser', schorle: 'Schorle', tee: 'Tee', milch: 'Milch', saft: 'Saft', sonstiges: 'Sonstiges' };
  const UNIT_LABEL = { half: '½ Glas', glass: 'Glas', bottle: 'Flasche', custom: 'eigene Menge', small: 'Schluck' };
  const KIND_LABEL = { woche: 'Woche', monat: 'Monat', gesamt: 'Gesamt' };

  /* =====================================================================
   * Emly.stats
   * ===================================================================== */
  const st = () => Emly.store;
  const todayKey = () => (st() && st().todayKey ? st().todayKey() : U.calKey(new Date()));
  const settings = () => (st() && st().getSettings ? st().getSettings() : {}) || {};

  function emptyDayparts() { const o = {}; U.DAYPARTS.forEach(p => { o[p.id] = 0; }); return o; }

  /** dayTotals vom Store normalisieren (defensiv gegen fehlende Felder) */
  function totals(key) {
    let t = null;
    try { t = st().dayTotals(key); } catch (e) { console.warn('[stats] dayTotals', key, e); }
    t = t || {};
    const byDaypart = emptyDayparts();
    let hasDp = false;
    if (t.byDaypart && typeof t.byDaypart === 'object') {
      U.DAYPARTS.forEach(p => { if (typeof t.byDaypart[p.id] === 'number') { byDaypart[p.id] = t.byDaypart[p.id]; hasDp = true; } });
    }
    if (!hasDp && fin(t.ml) > 0 && st().entriesForDay) {
      st().entriesForDay(key).forEach(e => { if (e.type === 'drink') byDaypart[U.daypart(e.ts)] += fin(e.ml); });
    }
    const s = settings();
    const goal = fin(t.goal) || (t.training === true ? fin(s.goalTraining) || 1700 : fin(s.goalBase) || 1200);
    const ml = fin(t.ml);
    const drinks = fin(t.drinks), toilets = fin(t.toilets);
    const tk = todayKey();
    return {
      key, ml, goal, pct: goal ? Math.round(ml / goal * 100) : 0, drinks, toilets,
      training: t.training === true ? true : t.training === false ? false : null,
      nightBefore: t.nightBefore || null, byDaypart,
      firstDrinkTs: t.firstDrinkTs || null, lastDrinkTs: t.lastDrinkTs || null,
      hasData: drinks > 0 || toilets > 0 || ml > 0,
      isToday: key === tk, isFuture: key > tk,
      goalMet: goal > 0 && ml >= goal
    };
  }

  function period(kind, refKey) {
    const to = refKey || todayKey();
    let from;
    if (kind === 'woche') from = U.addDays(to, -6);
    else if (kind === 'monat') from = U.addDays(to, -29);
    else {
      kind = 'gesamt';
      let first = null;
      try { first = st().firstDayKey(); } catch (e) { /* noop */ }
      from = first && first <= to ? first : to;
    }
    const sameYear = from.slice(0, 4) === to.slice(0, 4);
    const label = (sameYear ? U.fmtDateShort(from) : U.fmtDate(from)) + ' – ' + U.fmtDate(to);
    const titles = { woche: 'Letzte 7 Tage', monat: 'Letzte 30 Tage', gesamt: 'Gesamter Zeitraum' };
    return { kind, from, to, label, title: titles[kind], nDays: U.range(from, to).length };
  }

  const avg = (arr, f) => arr.length ? arr.reduce((s, x) => s + f(x), 0) / arr.length : 0;

  function summary(from, to) {
    if (!from || !to || from > to) { const tk = todayKey(); from = from || tk; to = to && to >= from ? to : from; }
    const days = U.range(from, to).map(totals);
    const withData = days.filter(d => d.hasData);
    // Basis für Durchschnitte: erfasste, abgeschlossene Tage. Der laufende Tag verzerrt Ø-Werte,
    // er zählt nur mit, wenn es sonst keinen erfassten Tag gibt.
    let basis = withData.filter(d => !d.isToday && !d.isFuture);
    const basisIncludesToday = basis.length === 0 && withData.some(d => d.isToday);
    if (basisIncludesToday) basis = withData.filter(d => d.isToday);
    const todayExcluded = !basisIncludesToday && withData.some(d => d.isToday);

    const training = basis.filter(d => d.training === true);
    const other = basis.filter(d => d.training !== true);
    const basisMl = basis.reduce((s, d) => s + d.ml, 0);
    const byDaypart = emptyDayparts(), byDaypartPct = emptyDayparts();
    U.DAYPARTS.forEach(p => {
      const sum = basis.reduce((s, d) => s + d.byDaypart[p.id], 0);
      byDaypart[p.id] = basis.length ? Math.round(sum / basis.length) : 0;
      byDaypartPct[p.id] = basisMl ? Math.round(sum / basisMl * 100) : 0;
    });

    // Vormittag an Schultagen: nur Mo–Fr (Wochenenden verzerren das „Schulzeit“-Muster). Ferien kennt die App nicht.
    const weekdayBasis = basis.filter(d => { const w = U.keyToDate(d.key).getDay(); return w >= 1 && w <= 5; });
    const schoolMorningMl = weekdayBasis.length ? Math.round(weekdayBasis.reduce((s, d) => s + d.byDaypart.vormittags, 0) / weekdayBasis.length) : 0;

    // Ziel-Serie: aufeinanderfolgende Tage mit erreichtem Ziel. Heute bricht die Serie nicht (läuft noch).
    let best = 0, run = 0;
    days.forEach(d => { if (d.goalMet) { run++; best = Math.max(best, run); } else if (!d.isToday) run = 0; });
    let current = 0;
    for (let i = days.length - 1; i >= 0; i--) {
      const d = days[i];
      if (d.goalMet) current++;
      else if (d.isToday || d.isFuture) continue;
      else break;
    }

    const answered = days.filter(d => d.nightBefore && typeof d.nightBefore.toilet === 'number');
    const bedAnswered = days.filter(d => d.nightBefore && (d.nightBefore.bed === 'trocken' || d.nightBefore.bed === 'nass'));
    const nightsWithToilet = answered.filter(d => d.nightBefore.toilet >= 1).length;

    const goalDays = basis.filter(d => d.goalMet).length;
    const sum = {
      from, to, days,
      daysInRange: days.length,
      daysWithData: withData.length,
      basisDays: basis.length, basisIncludesToday, todayExcluded,
      avgMl: Math.round(avg(basis, d => d.ml)),
      avgMlTraining: Math.round(avg(training, d => d.ml)),
      avgMlSchool: Math.round(avg(other, d => d.ml)),
      trainingBasisDays: training.length, otherBasisDays: other.length,
      avgGoal: Math.round(avg(basis, d => d.goal)),
      goalDays,
      goalRate: basis.length ? Math.round(goalDays / basis.length * 100) : 0,
      trainingDays: days.filter(d => d.training === true).length,
      trainingAnswered: days.filter(d => d.training !== null).length,
      avgToilets: Math.round(avg(basis, d => d.toilets) * 10) / 10,
      totalToilets: withData.reduce((s, d) => s + d.toilets, 0),
      byDaypart, byDaypartPct,
      weekdayBasisDays: weekdayBasis.length, schoolMorningMl,
      nightsAnswered: answered.length,
      nightsWithToilet,
      nightToiletRate: answered.length ? Math.round(nightsWithToilet / answered.length * 100) : 0,
      nightsBedAnswered: bedAnswered.length,
      nightsNotDry: bedAnswered.filter(d => d.nightBefore.bed === 'nass').length,
      bestStreak: best, currentStreak: current,
      totalMl: withData.reduce((s, d) => s + d.ml, 0),
      dge: DGE_ML,
      avgPctDge: Math.round(avg(basis, d => d.ml) / DGE_ML * 100)
    };
    sum.isEmpty = sum.daysWithData === 0 && sum.nightsAnswered === 0;
    sum.patternNotes = notes(sum, 'du');
    sum.patternNotesReport = notes(sum, 'report');
    return sum;
  }

  /** 2–4 sachliche Aussagen. voice 'du' (App, an die Nutzerin) oder 'report' (PDF, 3. Person). Keine Diagnosen/Ratschläge. */
  function notes(s, voice) {
    const du = voice !== 'report';
    if (s.basisDays === 0) {
      return s.nightsAnswered
        ? [du ? 'Noch keine Trink-Einträge in diesem Zeitraum.' : 'Keine Trink-Einträge in diesem Zeitraum.']
        : ['Noch keine Daten in diesem Zeitraum.'];
    }
    if (s.basisIncludesToday) {
      return [du ? 'Bisher ist nur heute eingetragen – der Tag läuft noch. Muster gibt es nach ein paar Tagen.'
        : 'Bisher nur der laufende Tag erfasst – noch keine Aussage zu Mustern möglich.'];
    }
    const out = [];
    const parts = U.DAYPARTS.map(p => ({ p, pct: s.byDaypartPct[p.id], ml: s.byDaypart[p.id] }));
    const top = parts.slice().sort((a, b) => b.pct - a.pct)[0];
    if (top && top.pct > 0) {
      out.push(du ? `Am meisten trinkst du ${top.p.label.toLowerCase().replace(' / nacht', '')} (${fmt.pct(top.pct)}).`
        : `Größter Anteil der Trinkmenge: ${top.p.label} (${top.p.range}, ${fmt.pct(top.pct)}).`);
    }
    // „Schulzeit“-Muster nur über Mo–Fr (Abnahme: Wochenenden nicht mitrechnen)
    if (top && top.p.id !== 'vormittags' && s.weekdayBasisDays >= 3 && s.schoolMorningMl < 250) {
      out.push(du ? `Vormittags an Schultagen (Mo–Fr, 9–12 Uhr) eher wenig: Ø ${fmt.ml(s.schoolMorningMl)}.`
        : `Vormittags an Schultagen (Mo–Fr, 9–12 Uhr) eher wenig: Ø ${fmt.ml(s.schoolMorningMl)} pro Tag.`);
    }
    if (s.trainingBasisDays > 0 && s.otherBasisDays > 0) {
      out.push(`An Trainingstagen Ø ${fmt.ml(s.avgMlTraining)}, sonst Ø ${fmt.ml(s.avgMlSchool)}.`);
    }
    const late = s.byDaypartPct.abends + s.byDaypartPct.spaet;
    if (late >= 25 && out.length < 4) out.push(`Nach 18 Uhr: ${fmt.pct(late)} der Tagesmenge.`);
    if (out.length < 4) {
      out.push(du ? `Ziel an ${fmt.of(s.goalDays, s.basisDays)} ${s.basisDays === 1 ? 'Tag' : 'Tagen'} erreicht.`
        : `Persönliches Tagesziel an ${fmt.of(s.goalDays, s.basisDays)} erfassten Tagen erreicht (${fmt.pct(s.goalRate)}).`);
    }
    if (s.basisDays < 3 && out.length < 4) {
      out.push(du ? `Erst ${fmt.days(s.basisDays)} erfasst – mit mehr Tagen werden die Muster genauer.`
        : `Erst ${fmt.days(s.basisDays)} erfasst – Aussagekraft begrenzt.`);
    }
    return out.slice(0, 4);
  }

  /** ISO-Kalenderwoche */
  function isoWeek(key) {
    const d = U.keyToDate(key);
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 864e5 + 1) / 7);
  }

  /** Datenreihe für Tages-Charts. Bis 42 Tage tageweise, darüber Wochen-Mittel (Ø pro erfasstem Tag). */
  function series(s) {
    if (s.days.length <= 42) {
      return {
        mode: 'day', items: s.days.map(d => ({
          key: d.key, label: U.weekday(d.key), date: U.fmtDateShort(d.key), ml: d.ml, goal: d.goal,
          training: d.training === true ? 1 : 0, toilets: d.toilets, hasData: d.hasData, partial: d.isToday, goalMet: d.goalMet
        }))
      };
    }
    const groups = [];
    s.days.forEach(d => {
      const wk = isoWeek(d.key);
      const g = groups[groups.length - 1];
      if (!g || g.wk !== wk || U.weekday(d.key) === 'Mo' && g.days.length) groups.push({ wk, days: [d] });
      else g.days.push(d);
    });
    return {
      mode: 'week', items: groups.map(g => {
        const b = g.days.filter(d => d.hasData && !d.isToday);
        const bb = b.length ? b : g.days.filter(d => d.hasData);
        const ml = Math.round(avg(bb, d => d.ml)), goal = Math.round(avg(bb.length ? bb : g.days, d => d.goal));
        return {
          key: g.days[0].key, label: 'KW' + g.wk, date: U.fmtDateShort(g.days[0].key), ml, goal,
          training: g.days.filter(d => d.training === true).length,
          toilets: Math.round(avg(bb, d => d.toilets) * 10) / 10,
          hasData: bb.length > 0, partial: g.days.some(d => d.isToday), goalMet: bb.length > 0 && ml >= goal, nDays: bb.length
        };
      })
    };
  }

  Emly.stats = { DGE_ML, fmt, period, summary, notes, series, isoWeek, DRINK_LABEL, UNIT_LABEL, KIND_LABEL, _totals: totals };

  /* =====================================================================
   * SVG-Charts (ohne Library, viewBox → responsiv)
   * ===================================================================== */
  const esc = U.esc;
  const W = 340;

  function niceMax(v, step) { return Math.max(step, Math.ceil(v / step) * step); }
  function labelEvery(n) { return n <= 8 ? 1 : n <= 16 ? 2 : Math.ceil(n / 7); }

  function chartDaily(s) {
    const ser = series(s), it = ser.items, n = it.length;
    const H = 200, L = 34, R = 6, T = 16, B = n <= 8 ? 40 : 34;
    const iw = W - L - R, ih = H - T - B;
    const maxV = Math.max(...it.map(x => Math.max(x.ml, x.goal)), DGE_ML);
    const ymax = niceMax(maxV * 1.08, 500);
    const step = ymax > 3000 ? 1000 : 500;
    const y = v => T + ih - (v / ymax) * ih;
    const slot = iw / n, bw = Math.max(2, Math.min(28, slot * 0.64));
    let g = '';
    for (let v = 0; v <= ymax; v += step) {
      g += `<line class="r-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`;
      g += `<text class="r-axis" x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end">${v === 0 ? '0' : fmt.dec1(v / 1000).replace(',0', '') + ' l'}</text>`;
    }
    // Ziel als Stufenlinie
    let path = '';
    it.forEach((x, i) => { const x0 = L + i * slot, x1 = x0 + slot; path += (i ? `L${x0} ${y(x.goal)}` : `M${x0} ${y(x.goal)}`) + `L${x1} ${y(x.goal)}`; });
    const every = labelEvery(n);
    let bars = '', marks = '', labels = '';
    it.forEach((x, i) => {
      const cx = L + i * slot + slot / 2;
      const h = Math.max(x.ml > 0 ? 1.5 : 0, (x.ml / ymax) * ih);
      const cls = 'r-bar' + (x.goalMet ? ' r-bar-ok' : '') + (x.partial ? ' r-bar-today' : '');
      const tip = `${ser.mode === 'week' ? x.label : U.weekday(x.key) + ' ' + x.date}: ${fmt.ml(x.ml)} / Ziel ${fmt.ml(x.goal)}`;
      bars += `<rect class="${cls}" x="${cx - bw / 2}" y="${T + ih - h}" width="${bw}" height="${h}" rx="${Math.min(4, bw / 3)}"><title>${esc(tip)}</title></rect>`;
      if (!x.hasData && n <= 31) bars += `<text class="r-axis r-nodata" x="${cx}" y="${T + ih - 3}" text-anchor="middle">–</text>`;
      if (n <= 8 && x.ml > 0) bars += `<text class="r-val" x="${cx}" y="${T + ih - h - 4}" text-anchor="middle">${fmt.dec1(x.ml / 1000)}</text>`;
      if (x.training) {
        marks += `<circle class="r-train" cx="${cx}" cy="${T + ih + 7}" r="${n > 20 ? 2.6 : 3.4}"/>`;
        if (ser.mode === 'week') marks += `<text class="r-axis" x="${cx + 4.5}" y="${T + ih + 10}">${x.training}</text>`;
      }
      if (i % every === 0 || (n <= 8)) {
        if (n <= 8) labels += `<text class="r-axis r-strong" x="${cx}" y="${H - B + 22}" text-anchor="middle">${x.label}</text><text class="r-axis" x="${cx}" y="${H - B + 33}" text-anchor="middle">${x.date}</text>`;
        else labels += `<text class="r-axis" x="${cx}" y="${H - B + 24}" text-anchor="middle">${ser.mode === 'week' ? x.label : x.date}</text>`;
      }
    });
    return `<svg class="r-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Trinkmenge pro ${ser.mode === 'week' ? 'Woche (Ø pro Tag)' : 'Tag'} mit Ziellinie">
      ${g}${bars}<path class="r-goal" d="${path}"/>${marks}${labels}</svg>`;
  }

  function chartDayparts(s) {
    const rows = U.DAYPARTS, rh = 30, T = 4, H = T + rows.length * rh;
    const L = 96, tw = 150, maxV = Math.max(1, ...rows.map(p => s.byDaypart[p.id]));
    let out = '';
    rows.forEach((p, i) => {
      const y0 = T + i * rh, v = s.byDaypart[p.id], w = (v / maxV) * tw;
      out += `<text class="r-lbl" x="0" y="${y0 + 13}">${p.label}</text><text class="r-axis" x="0" y="${y0 + 25}">${p.range}</text>`;
      out += `<rect class="r-track" x="${L}" y="${y0 + 6}" width="${tw}" height="14" rx="7"/>`;
      if (v > 0) out += `<rect class="r-hbar" x="${L}" y="${y0 + 6}" width="${Math.max(6, w)}" height="14" rx="7"/>`;
      out += `<text class="r-lbl r-strong" x="${W}" y="${y0 + 13}" text-anchor="end">${fmt.pct(s.byDaypartPct[p.id])}</text>`;
      out += `<text class="r-axis" x="${W}" y="${y0 + 25}" text-anchor="end">Ø ${fmt.ml(v)}</text>`;
    });
    return `<svg class="r-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Verteilung der Trinkmenge über den Tag">${out}</svg>`;
  }

  function chartToilets(s) {
    const ser = series(s), it = ser.items, n = it.length;
    const H = 140, L = 34, R = 6, T = 14, B = 26;
    const iw = W - L - R, ih = H - T - B;
    const ymax = Math.max(4, Math.ceil(Math.max(...it.map(x => x.toilets)) + 1));
    const step = ymax > 10 ? 4 : 2;
    const y = v => T + ih - (v / ymax) * ih;
    const slot = iw / n, bw = Math.max(2, Math.min(22, slot * 0.56));
    let g = '';
    for (let v = 0; v <= ymax; v += step) {
      g += `<line class="r-grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text class="r-axis" x="${L - 5}" y="${y(v) + 3.5}" text-anchor="end">${v}</text>`;
    }
    let bars = '', labels = '';
    const every = labelEvery(n);
    it.forEach((x, i) => {
      const cx = L + i * slot + slot / 2, h = (x.toilets / ymax) * ih;
      bars += `<rect class="r-tbar${x.partial ? ' r-bar-today' : ''}" x="${cx - bw / 2}" y="${T + ih - h}" width="${bw}" height="${h}" rx="${Math.min(3, bw / 3)}"><title>${esc((ser.mode === 'week' ? x.label + ' Ø ' : x.date + ': ') + fmt.dec1(x.toilets).replace(',0', ''))}</title></rect>`;
      if (n <= 14 && x.hasData) bars += `<text class="r-val" x="${cx}" y="${T + ih - h - 3}" text-anchor="middle">${ser.mode === 'week' ? fmt.dec1(x.toilets) : x.toilets}</text>`;
      if (i % every === 0) labels += `<text class="r-axis" x="${cx}" y="${H - 8}" text-anchor="middle">${n <= 8 ? x.label : ser.mode === 'week' ? x.label : x.date}</text>`;
    });
    let avgLine = '';
    if (s.basisDays) {
      const ya = y(s.avgToilets);
      avgLine = `<line class="r-avg" x1="${L}" x2="${W - R}" y1="${ya}" y2="${ya}"/><text class="r-axis r-avgt" x="${W - R}" y="${ya - 4}" text-anchor="end">Ø ${fmt.dec1(s.avgToilets)}</text>`;
    }
    return `<svg class="r-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Toilettengänge pro ${ser.mode === 'week' ? 'Woche (Ø pro Tag)' : 'Tag'}">${g}${bars}${avgLine}${labels}</svg>`;
  }

  const DROP = (x, y, r) => `M${x} ${y - r * 1.35}C${x + r * 0.9} ${y - r * 0.2} ${x + r} ${y + r * 0.2} ${x} ${y + r}C${x - r} ${y + r * 0.2} ${x - r * 0.9} ${y - r * 0.2} ${x} ${y - r * 1.35}Z`;

  /** Nacht-Kalender (Mo–So). Für lange Zeiträume die letzten 12 Wochen. */
  function chartNights(s) {
    const MAXW = 12;
    let first = s.from;
    // Wochenstart Montag
    const dow = k => (U.keyToDate(k).getDay() + 6) % 7;
    let start = U.addDays(first, -dow(first));
    const end = U.addDays(s.to, 6 - dow(s.to));
    let weeks = Math.round(U.range(start, end).length / 7);
    let truncated = false;
    if (weeks > MAXW) { start = U.addDays(end, -(MAXW * 7 - 1)); weeks = MAXW; truncated = true; }
    const cw = W / 7, chH = 44, T = 18, H = T + weeks * chH;
    const byKey = {}; s.days.forEach(d => { byKey[d.key] = d; });
    let out = '';
    ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach((w, i) => { out += `<text class="r-axis r-strong" x="${i * cw + cw / 2}" y="11" text-anchor="middle">${w}</text>`; });
    U.range(start, end).forEach((k, idx) => {
      const col = idx % 7, row = Math.floor(idx / 7);
      const cx = col * cw + cw / 2, cy = T + row * chH + 24, d = byKey[k];
      const dayNum = Number(k.slice(8));
      if (!d) { out += `<text class="r-axis r-out" x="${cx}" y="${cy + 3.5}" text-anchor="middle">${dayNum}</text>`; return; }
      const nb = d.nightBefore;
      const dateTxt = `<text class="r-axis" x="${col * cw + 4}" y="${cy - 12}">${dayNum}.</text>`;
      let c, tip;
      if (!nb || typeof nb.toilet !== 'number') {
        c = `<circle class="r-n-none" cx="${cx}" cy="${cy}" r="10"/>`; tip = 'nicht eingetragen';
      } else if (nb.toilet === 0) {
        c = `<circle class="r-n-0" cx="${cx}" cy="${cy}" r="10"/>`; tip = 'keine Nachttoilette';
      } else {
        c = `<circle class="r-n-${nb.toilet >= 2 ? 2 : 1}" cx="${cx}" cy="${cy}" r="10"/><text class="r-n-t${nb.toilet >= 2 ? '' : ' r-n-t1'}" x="${cx}" y="${cy + 3.8}" text-anchor="middle">${nb.toilet >= 2 ? '2+' : '1'}</text>`;
        tip = nb.toilet >= 2 ? 'nachts 2× oder öfter auf Toilette' : 'nachts 1× auf Toilette';
      }
      if (nb && nb.bed === 'nass') { c += `<path class="r-n-bed" d="${DROP(cx + 12.5, cy + 7, 3.8)}"/>`; tip += ', Bett nicht ganz trocken'; }
      out += `<g><title>${esc(U.fmtDateShort(k) + ' (Nacht davor): ' + tip)}</title>${dateTxt}${c}</g>`;
    });
    return { svg: `<svg class="r-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Nacht-Kalender">${out}</svg>`, truncated };
  }

  /* =====================================================================
   * Screen 'berichte'
   * ===================================================================== */
  const CSS = `
  .r-wrap{padding:16px 16px 28px;color:var(--c-text,#0f2a3a);max-width:640px;margin:0 auto;box-sizing:border-box}
  .r-wrap *{box-sizing:border-box}
  .r-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin:4px 2px 12px}
  .r-head h1{font-size:24px;line-height:1.15;margin:0;font-weight:800;letter-spacing:-.01em}
  .r-range{font-size:13px;color:var(--c-muted,#5b7383);white-space:nowrap}
  .r-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;border-radius:999px;background:var(--c-card,#fff);box-shadow:var(--shadow,0 2px 10px rgba(15,42,58,.08));margin-bottom:14px}
  .r-seg button{min-height:48px;border:0;border-radius:999px;background:transparent;font:inherit;font-size:15px;font-weight:700;color:var(--c-muted,#5b7383);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .2s,color .2s}
  .r-seg button[aria-selected="true"]{background:linear-gradient(135deg,var(--c-primary,#0e8fb8),var(--c-primary-2,#3cc7e6));color:#fff;box-shadow:0 2px 8px rgba(14,143,184,.3)}
  .r-seg button:focus-visible{outline:3px solid var(--c-accent,#ffb020);outline-offset:2px}
  .r-kpis{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
  .r-kpi{background:var(--c-card,#fff);border-radius:var(--radius,18px);box-shadow:var(--shadow,0 2px 10px rgba(15,42,58,.08));padding:12px 14px;min-width:0}
  .r-kpi-l{font-size:12.5px;color:var(--c-muted,#5b7383);font-weight:600;line-height:1.25}
  .r-kpi-v{font-size:22px;font-weight:800;margin-top:4px;line-height:1.15;letter-spacing:-.01em;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
  .r-kpi-v small{font-size:14px;font-weight:700}
  .r-kpi-s{font-size:12px;color:var(--c-muted,#5b7383);margin-top:3px;line-height:1.3}
  .r-meter{height:6px;border-radius:3px;background:color-mix(in srgb,var(--c-primary,#0e8fb8) 14%,transparent);margin-top:7px;overflow:hidden}
  .r-meter i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--c-primary,#0e8fb8),var(--c-primary-2,#3cc7e6))}
  .r-card{background:var(--c-card,#fff);border-radius:var(--radius,18px);box-shadow:var(--shadow,0 2px 10px rgba(15,42,58,.08));padding:14px 14px 12px;margin-bottom:14px}
  .r-card h2{font-size:16px;margin:0 0 2px;font-weight:800}
  .r-sub{font-size:12.5px;color:var(--c-muted,#5b7383);margin:0 0 10px;line-height:1.35}
  .r-svg{display:block;width:100%;height:auto;overflow:visible;font-family:inherit}
  .r-grid{stroke:var(--c-text,#0f2a3a);stroke-opacity:.08;stroke-width:1}
  .r-axis{font-size:10px;fill:var(--c-muted,#5b7383)}
  .r-strong{font-weight:700;fill:var(--c-text,#0f2a3a)}
  .r-lbl{font-size:11.5px;fill:var(--c-text,#0f2a3a)}
  .r-val{font-size:9.5px;font-weight:700;fill:var(--c-text,#0f2a3a);paint-order:stroke;stroke:var(--c-card,#fff);stroke-width:3px;stroke-linejoin:round}
  .r-bar{fill:var(--c-water,#22b8d9);fill-opacity:.38;stroke:var(--c-water,#22b8d9);stroke-width:1.25;stroke-opacity:.95}
  .r-bar-ok{fill:var(--c-primary,#0e8fb8);fill-opacity:1;stroke:none}
  .r-bar-today{opacity:.4}
  .r-goal{fill:none;stroke:var(--c-accent,#ffb020);stroke-width:2;stroke-dasharray:5 3;stroke-linejoin:round}
  .r-train{fill:var(--c-accent,#ffb020)}
  .r-track{fill:var(--c-primary,#0e8fb8);fill-opacity:.1}
  .r-hbar{fill:var(--c-primary,#0e8fb8)}
  .r-tbar{fill:var(--c-primary,#0e8fb8);opacity:.8}
  .r-avg{stroke:var(--c-text,#0f2a3a);stroke-opacity:.45;stroke-dasharray:3 3}
  .r-avgt{font-weight:700}
  .r-out{opacity:.35}
  .r-n-none{fill:none;stroke:var(--c-muted,#5b7383);stroke-opacity:.45;stroke-dasharray:2.5 2.5}
  .r-n-0{fill:var(--c-card,#fff);stroke:var(--c-primary,#0e8fb8);stroke-opacity:.55;stroke-width:1.5}
  .r-n-1{fill:var(--c-night,#6e7fd8);fill-opacity:.32;stroke:var(--c-night,#6e7fd8);stroke-width:1.5}
  .r-n-2{fill:color-mix(in srgb,var(--c-night,#6e7fd8) 82%,#1b2559)}
  .r-n-t{font-size:9.5px;font-weight:800;fill:#fff}
  .r-n-t1{fill:color-mix(in srgb,var(--c-night,#6e7fd8) 55%,#1b2559)}
  .r-n-bed{fill:#7f95a6}
  .r-legend{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:12px;color:var(--c-muted,#5b7383);margin-top:10px;line-height:1.3}
  .r-legend span{display:inline-flex;align-items:center;gap:6px}
  .r-legend svg{flex:none}
  .r-notes{margin:0;padding:0;list-style:none}
  .r-notes li{position:relative;padding:8px 0 8px 22px;font-size:14.5px;line-height:1.4;border-top:1px solid color-mix(in srgb,var(--c-text,#0f2a3a) 8%,transparent)}
  .r-notes li:first-child{border-top:0}
  .r-notes li::before{content:"";position:absolute;left:4px;top:14px;width:8px;height:8px;border-radius:50%;background:var(--c-primary-2,#3cc7e6)}
  .r-pdf{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;border:0;border-radius:999px;font:inherit;font-size:16.5px;font-weight:800;color:#fff;cursor:pointer;
    background:linear-gradient(135deg,var(--c-primary,#0e8fb8),var(--c-primary-2,#3cc7e6));box-shadow:0 6px 18px rgba(14,143,184,.32);margin:4px 0 12px;-webkit-tap-highlight-color:transparent}
  .r-pdf:active{transform:scale(.98)}
  .r-pdf[disabled]{opacity:.7;cursor:progress}
  .r-pdf:focus-visible{outline:3px solid var(--c-accent,#ffb020);outline-offset:3px}
  .r-spin{width:18px;height:18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.45);border-top-color:#fff;animation:r-spin .8s linear infinite}
  @keyframes r-spin{to{transform:rotate(360deg)}}
  .r-hint{font-size:12.5px;color:var(--c-muted,#5b7383);text-align:center;line-height:1.45;margin:0 8px}
  .r-empty{text-align:center;padding:26px 18px}
  .r-empty .r-drop{width:56px;height:56px;margin:0 auto 10px}
  .r-empty h2{margin:0 0 6px}
  .r-empty p{margin:0;color:var(--c-muted,#5b7383);font-size:14px;line-height:1.45}
  @media (max-width:370px){.r-kpi-v{font-size:20px}.r-wrap{padding:14px 12px 24px}}
  @media (prefers-reduced-motion:reduce){.r-seg button{transition:none}.r-spin{animation-duration:2s}}
  `;
  function injectStyles() {
    if (document.getElementById('reports-styles')) return;
    const el = document.createElement('style');
    el.id = 'reports-styles'; el.textContent = CSS;
    document.head.appendChild(el);
  }

  const sw = (cls, shape) => `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">${shape || `<rect class="${cls}" x="1" y="1" width="12" height="12" rx="3"/>`}</svg>`;

  const view = { el: null, kind: 'woche', busy: false, pending: 0, off: null };

  function kpi(label, value, sub, meterPct) {
    return `<div class="r-kpi"><div class="r-kpi-l">${label}</div><div class="r-kpi-v">${value}</div>${sub ? `<div class="r-kpi-s">${sub}</div>` : ''}${meterPct != null ? `<div class="r-meter" aria-hidden="true"><i style="width:${U.clamp(meterPct, 0, 100)}%"></i></div>` : ''}</div>`;
  }

  function render() {
    const el = view.el; if (!el) return;
    injectStyles();
    let p, s;
    try { p = period(view.kind); s = summary(p.from, p.to); } catch (e) { console.error('[berichte]', e); el.innerHTML = '<div class="r-wrap"><div class="r-card r-empty"><p>Auswertung gerade nicht möglich.</p></div></div>'; return; }
    const seg = ['woche', 'monat', 'gesamt'].map(k => `<button type="button" role="tab" data-kind="${k}" aria-selected="${k === view.kind}">${KIND_LABEL[k]}</button>`).join('');
    const dash = '–';
    const hasBasis = s.basisDays > 0;
    // Nur der laufende Tag erfasst: keine „0 von 1“-Bilanz für einen Tag, der noch nicht vorbei ist.
    const onlyToday = s.basisIncludesToday;
    const todayT = s.days.find(d => d.isToday);
    const kpis = [
      kpi(onlyToday ? 'Bisher heute' : 'Ø getrunken pro Tag', hasBasis ? fmt.ml(s.avgMl) : dash, onlyToday ? 'der Tag läuft noch' : hasBasis ? `${fmt.pct(s.avgPctDge)} vom Richtwert (${fmt.ml(DGE_ML)})` : 'noch keine Daten', hasBasis ? s.avgPctDge : null),
      onlyToday
        ? kpi('Tagesziel heute', fmt.pct(todayT ? todayT.pct : 0), 'läuft noch – zählt ab morgen mit', todayT ? todayT.pct : 0)
        : kpi('Ziel erreicht', hasBasis ? `${s.goalDays}<small> von ${s.basisDays}</small>` : dash, hasBasis ? `${fmt.pct(s.goalRate)} · beste Serie ${fmt.days(s.bestStreak)}` : 'noch keine Daten', hasBasis ? s.goalRate : null),
      kpi('Trainingstage', fmt.days(s.trainingDays), s.trainingBasisDays ? `Ø ${fmt.ml(s.avgMlTraining)} an Trainingstagen` : (s.trainingAnswered ? 'kein Training eingetragen' : 'noch nicht eingetragen')),
      kpi('Toilette pro Tag', hasBasis ? `Ø ${fmt.dec1(s.avgToilets)}` : dash, hasBasis ? `${fmt.int(s.totalToilets)} Einträge gesamt` : 'noch keine Daten'),
      kpi('Nächte mit Toilettengang', s.nightsAnswered ? `${s.nightsWithToilet}<small> von ${s.nightsAnswered}</small>` : dash, s.nightsAnswered ? `${fmt.nights(s.nightsAnswered)} eingetragen` : 'noch keine Nacht eingetragen'),
      kpi('Insgesamt getrunken', s.totalMl ? fmt.l(s.totalMl) : dash, s.daysWithData ? `an ${fmt.daysDat(s.daysWithData)} mit Einträgen` : 'noch keine Daten')
    ].join('');

    let body;
    if (s.isEmpty) {
      body = `<div class="r-card r-empty">
        <svg class="r-drop" viewBox="0 0 56 56" aria-hidden="true"><defs><linearGradient id="r-dg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--c-primary-2,#3cc7e6)"/><stop offset="1" stop-color="var(--c-primary,#0e8fb8)"/></linearGradient></defs><path fill="url(#r-dg)" d="M28 4C36 16 46 26 46 36a18 18 0 0 1-36 0C10 26 20 16 28 4Z"/><circle cx="22" cy="36" r="2.4" fill="#fff"/><circle cx="34" cy="36" r="2.4" fill="#fff"/><path d="M23 43q5 4 10 0" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>
        <h2>Noch keine Daten</h2>
        <p>Trag auf „Heute“ ein, was du trinkst – hier siehst du dann deine Auswertung für ${p.kind === 'gesamt' ? 'die ganze Zeit' : p.kind === 'monat' ? 'den Monat' : 'die Woche'}.</p></div>`;
    } else {
      const nights = chartNights(s);
      const ser = series(s);
      const perWeek = ser.mode === 'week';
      body = `
      <section class="r-card"><h2>Trinkmenge ${perWeek ? 'pro Woche' : 'pro Tag'}</h2>
        <p class="r-sub">${perWeek ? 'Ø pro erfasstem Tag je Kalenderwoche' : 'Balken = getrunken, gestrichelt = dein Tagesziel'}${s.todayExcluded ? ' · heute läuft noch' : ''}</p>
        ${chartDaily(s)}
        <div class="r-legend"><span>${sw('r-bar r-bar-ok')}Ziel erreicht</span><span>${sw('r-bar')}unter Ziel</span>
          <span><svg width="18" height="14" viewBox="0 0 18 14" aria-hidden="true"><path class="r-goal" d="M1 7H17"/></svg>Ziel</span>
          <span><svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><circle class="r-train" cx="7" cy="7" r="4"/></svg>⚽ Training${perWeek ? ' (Anzahl)' : ''}</span></div>
      </section>
      <section class="r-card"><h2>Wann trinkst du?</h2><p class="r-sub">Anteil an der Tagesmenge und Ø ml pro Tag</p>${chartDayparts(s)}</section>
      <section class="r-card"><h2>Toilettengänge ${perWeek ? 'pro Woche' : 'pro Tag'}</h2><p class="r-sub">${perWeek ? 'Ø pro Tag je Kalenderwoche' : 'Einträge tagsüber'}</p>${chartToilets(s)}</section>
      <section class="r-card"><h2>Nächte</h2><p class="r-sub">Die Nacht vor dem jeweiligen Tag${nights.truncated ? ' · letzte 12 Wochen' : ''}</p>${nights.svg}
        <div class="r-legend"><span>${sw('', '<circle class="r-n-0" cx="7" cy="7" r="5.5"/>')}keine Toilette</span>
          <span>${sw('', '<circle class="r-n-1" cx="7" cy="7" r="6"/>')}1×</span><span>${sw('', '<circle class="r-n-2" cx="7" cy="7" r="6"/>')}2× oder öfter</span>
          <span>${sw('', '<circle class="r-n-none" cx="7" cy="7" r="5.5"/>')}nicht eingetragen</span>
          <span>${sw('', `<path class="r-n-bed" d="${DROP(7, 8, 3.6)}"/>`)}Bett nicht ganz trocken</span></div>
      </section>
      <section class="r-card"><h2>Das fällt auf</h2><ul class="r-notes">${s.patternNotes.map(t => `<li>${esc(t).replace(/Ø /g, 'Ø&nbsp;')}</li>`).join('')}</ul></section>`;
    }

    el.innerHTML = `<div class="r-wrap">
      <div class="r-head"><h1>Berichte</h1><span class="r-range">${esc(p.label)}</span></div>
      <div class="r-seg" role="tablist" aria-label="Zeitraum">${seg}</div>
      <div class="r-kpis">${kpis}</div>
      ${s.todayExcluded && !s.isEmpty ? '<p class="r-hint" style="margin:-4px 8px 12px;text-align:left">Durchschnitte ohne heute – der Tag läuft ja noch.</p>' : ''}
      ${body}
      <button type="button" class="r-pdf" data-act="pdf"${view.busy ? ' disabled' : ''}>${view.busy ? '<span class="r-spin" aria-hidden="true"></span>PDF wird erstellt …' : 'PDF erstellen &amp; teilen'}</button>
      <p class="r-hint">Richtwert DGE 10–13 J.: ca. 1.170 ml Getränke/Tag.<br>Dein Ziel: ${fmt.ml(settings().goalBase || 1200)} · an Trainingstagen ${fmt.ml(settings().goalTraining || 1700)}.</p>
    </div>`;
  }

  function onClick(ev) {
    const b = ev.target.closest('button'); if (!b || !view.el || !view.el.contains(b)) return;
    if (b.dataset.kind && b.dataset.kind !== view.kind) {
      view.kind = b.dataset.kind; render();
      const t = view.el.querySelector(`[data-kind="${view.kind}"]`); if (t) t.focus({ preventScroll: true });
      try { Emly.ui && Emly.ui.haptic && Emly.ui.haptic(10); } catch (e) { /* noop */ }
    } else if (b.dataset.act === 'pdf') {
      sharePdf();
    }
  }

  async function sharePdf() {
    if (view.busy) return;
    if (!Emly.pdf || !Emly.pdf.share) { toast('PDF ist gerade nicht verfügbar.'); return; }
    view.busy = true; render();
    try { await Emly.pdf.share(view.kind); }
    catch (e) { console.error('[berichte] pdf', e); toast('PDF konnte nicht erstellt werden.'); }
    finally { view.busy = false; render(); }
  }

  function toast(msg, opts) {
    try { if (Emly.ui && Emly.ui.toast) { Emly.ui.toast(msg, opts); return; } } catch (e) { /* noop */ }
    console.info('[emly]', msg);
  }

  function scheduleRender() {
    if (!view.el || view.pending) return;
    view.pending = requestAnimationFrame(() => { view.pending = 0; render(); });
  }

  Emly.screens.register('berichte', {
    title: 'Berichte', icon: '📊', order: 30, nav: true,
    mount(el) {
      view.el = el; el.addEventListener('click', onClick);
      if (!view.off) view.off = Emly.bus.on('data:changed', ev => { if (!ev || ev.kind !== 'game') scheduleRender(); });
      render();
    },
    unmount() {
      if (view.el) view.el.removeEventListener('click', onClick);
      if (view.off) { view.off(); view.off = null; }
      if (view.pending) { cancelAnimationFrame(view.pending); view.pending = 0; }
      view.el = null;
    },
    refresh() { scheduleRender(); }
  });

  Emly.reports = { toast, get kind() { return view.kind; }, setKind(k) { if (KIND_LABEL[k]) { view.kind = k; scheduleRender(); } } };
})();
