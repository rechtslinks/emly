/* Emly – pdf.js (Dev B „Auswertung“, Jonas)
 * Emly.pdf.build(kind) → Promise<Blob>  ·  Emly.pdf.share(kind) → Promise<'shared'|'aborted'|'downloaded'|'deferred'>
 * A4 hoch, jsPDF-Primitiven (keine Bilder, keine Emojis). Zahlen aus Emly.stats (identisch zum Bericht-Screen).
 * Aufbau: S. 1 Übersicht (KPI, Tagesmengen, Tageszeiten, Nächte, Muster) · Tagesübersicht (Tabelle) ·
 *         Detailprotokoll (Trink- & Miktionsprotokoll, nur 'woche' standardmäßig).
 */
(function () {
  'use strict';
  const Emly = window.Emly;
  const U = Emly.util;

  /* ---------- Gestaltung ---------- */
  const PAGE = { w: 210, h: 297, ml: 16, mr: 16, mt: 16, mb: 18 };
  const CW = PAGE.w - PAGE.ml - PAGE.mr; // 178 mm
  const C = {
    text: [31, 45, 54], muted: [104, 120, 132], line: [214, 224, 230],
    accent: [14, 127, 166], accentSoft: [126, 196, 220], accentPale: [232, 244, 249],
    zebra: [245, 249, 251], goal: [214, 146, 46], dge: [150, 162, 172], bed: [143, 163, 179], white: [255, 255, 255]
  };

  /** Nur Zeichen, die die Standardschrift (WinAnsi) darstellen kann. Emojis u. Ä. entfallen. */
  const ALLOWED_EXTRA = '–—„“”‚‘’…•€‰';
  function safe(s) {
    return String(s == null ? '' : s).replace(/[  ]/g, ' ').replace(/[^ -~¡-ÿ]/g, ch => (ALLOWED_EXTRA.includes(ch) ? ch : ''))
      .replace(/ {2,}/g, ' ');
  }

  function create() {
    const J = window.jspdf && window.jspdf.jsPDF;
    if (!J) throw new Error('jsPDF nicht geladen');
    const doc = new J({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    doc.setProperties({ title: 'Emly – Trink- & Toilettenprotokoll', creator: 'Emly ' + (Emly.VERSION || ''), subject: 'Trink- und Toilettenprotokoll' });
    return doc;
  }

  /* ---------- kleine Zeichen-Helfer ---------- */
  function mk(doc) {
    const d = {
      doc, y: PAGE.mt,
      fill(c) { doc.setFillColor(c[0], c[1], c[2]); return d; },
      stroke(c) { doc.setDrawColor(c[0], c[1], c[2]); return d; },
      color(c) { doc.setTextColor(c[0], c[1], c[2]); return d; },
      font(size, style, c) { doc.setFont('helvetica', style || 'normal'); doc.setFontSize(size); d.color(c || C.text); return d; },
      text(s, x, y, opt) { doc.text(safe(s), x, y, opt || {}); return d; },
      width(s) { return doc.getTextWidth(safe(s)); },
      dash(on) { doc.setLineDashPattern(on ? on : [], 0); return d; },
      /** Text auf Breite kürzen */
      fit(s, w) { s = safe(s); if (doc.getTextWidth(s) <= w) return s; while (s.length > 1 && doc.getTextWidth(s + '…') > w) s = s.slice(0, -1); return s + '…'; },
      newPage() { doc.addPage(); d.y = PAGE.mt; return d; },
      bottom: PAGE.h - PAGE.mb,
      ensure(h) { if (d.y + h > d.bottom) { d.newPage(); return true; } return false; },
      h2(title, sub) {
        d.font(12.5, 'bold', C.text).text(title, PAGE.ml, d.y + 4.5);
        if (sub) d.font(8.5, 'normal', C.muted).text(sub, PAGE.ml, d.y + 9.5);
        d.y += sub ? 13 : 8;
      }
    };
    return d;
  }

  /* ---------- Seite 1 ---------- */
  function header(d, p, s, name) {
    const doc = d.doc;
    d.fill(C.accent); doc.rect(0, 0, PAGE.w, 3, 'F');
    // ein Textlauf (Standardschrift ist nicht eingebettet → Breitenmessung je nach Viewer ungenau)
    d.font(19, 'bold', C.text).text('Trink- & Toilettenprotokoll' + (name ? ' · ' + name : ''), PAGE.ml, d.y + 7);
    const now = new Date();
    d.font(9.5, 'normal', C.muted).text(`Zeitraum: ${p.label} (${p.kind === 'gesamt' ? 'gesamter Zeitraum, ' + p.nDays + ' Tage' : p.title})`, PAGE.ml, d.y + 13.5);
    d.text(`Erstellt am ${U.fmtDate(U.calKey(now))}, ${U.fmtTime(now.toISOString())} Uhr`, PAGE.w - PAGE.mr, d.y + 13.5, { align: 'right' });
    // Wortmarke
    d.font(11, 'bold', C.accent).text('Emly', PAGE.w - PAGE.mr, d.y + 6.5, { align: 'right' });
    d.y += 18;
    d.stroke(C.line); doc.setLineWidth(0.3); doc.line(PAGE.ml, d.y, PAGE.w - PAGE.mr, d.y);
    d.y += 5;
  }

  function kpis(d, s) {
    const F = Emly.stats.fmt, doc = d.doc, has = s.basisDays > 0;
    const items = [
      [s.basisIncludesToday ? 'Trinkmenge bisher (heute)' : 'Ø Trinkmenge pro Tag', has ? F.ml(s.avgMl) : '–', s.basisIncludesToday ? 'nur der laufende Tag erfasst' : has ? `${F.pct(s.avgPctDge)} des DGE-Richtwerts (${F.ml(s.dge)})` : 'keine Daten'],
      s.basisIncludesToday
        ? ['Tagesziel heute', F.pct((s.days.find(t => t.isToday) || {}).pct || 0), 'Tag läuft noch – noch keine Bilanz']
        : ['Tagesziel erreicht', has ? `${s.goalDays} von ${s.basisDays} Tagen` : '–', has ? `${F.pct(s.goalRate)} · längste Serie ${F.days(s.bestStreak)}` : 'keine Daten'],
      ['Trainingstage', F.days(s.trainingDays), s.trainingBasisDays ? `Ø ${F.ml(s.avgMlTraining)} · sonst Ø ${s.otherBasisDays ? F.ml(s.avgMlSchool) : '–'}` : 'keine erfassten Trainingstage'],
      ['Toilettengänge pro Tag', has ? `Ø ${F.dec1(s.avgToilets)}` : '–', has ? `${F.int(s.totalToilets)} Einträge im Zeitraum` : 'keine Daten'],
      ['Nächte mit Toilettengang', s.nightsAnswered ? `${s.nightsWithToilet} von ${s.nightsAnswered}` : '–', s.nightsAnswered ? `${F.pct(s.nightToiletRate)} der eingetragenen Nächte` : 'keine Angaben'],
      ['Gesamtmenge', s.totalMl ? F.l(s.totalMl) : '–', `an ${F.daysDat(s.daysWithData)} mit Einträgen`]
    ];
    const gap = 4, bw = (CW - 2 * gap) / 3, bh = 19;
    items.forEach((it, i) => {
      const x = PAGE.ml + (i % 3) * (bw + gap), y = d.y + Math.floor(i / 3) * (bh + gap);
      d.fill(C.accentPale); doc.roundedRect(x, y, bw, bh, 2, 2, 'F');
      d.fill(C.accent); doc.rect(x, y + 3, 0.9, bh - 6, 'F');
      d.font(7.8, 'normal', C.muted).text(it[0], x + 4, y + 5.2);
      d.font(13, 'bold', C.text).text(d.fit(it[1], bw - 7), x + 4, y + 11.6);
      d.font(7.2, 'normal', C.muted).text(d.fit(it[2], bw - 7), x + 4, y + 16.2);
    });
    d.y += 2 * bh + gap + 4;
    if (s.basisDays) {
      d.font(7.6, 'normal', C.muted).text(`Durchschnitte beziehen sich auf ${F.days(s.basisDays)} mit Einträgen${s.todayExcluded ? ' (ohne den heutigen, noch laufenden Tag)' : ''}. Tage ohne Einträge zählen nicht mit.`, PAGE.ml, d.y + 1);
      d.y += 5;
    }
  }

  function barChart(d, s) {
    const F = Emly.stats.fmt, doc = d.doc;
    const ser = Emly.stats.series(s), it = ser.items, n = it.length;
    const week = ser.mode === 'week';
    d.h2(week ? 'Trinkmenge pro Kalenderwoche (Ø pro erfasstem Tag)' : 'Trinkmenge pro Tag');
    const x0 = PAGE.ml + 11, w = CW - 11, top = d.y + 1, h = 50, base = top + h;
    const maxV = Math.max(s.dge, ...it.map(x => Math.max(x.ml, x.goal)));
    const step = maxV > 3200 ? 1000 : 500;
    const ymax = Math.max(step, Math.ceil(maxV * 1.08 / step) * step);
    const Y = v => base - (v / ymax) * h;
    doc.setLineWidth(0.2);
    for (let v = 0; v <= ymax; v += step) {
      d.stroke(v ? C.line : C.muted); doc.line(x0, Y(v), x0 + w, Y(v));
      d.font(7, 'normal', C.muted).text(v ? F.dec1(v / 1000).replace(',0', '') + ' l' : '0', x0 - 2, Y(v) + 1.2, { align: 'right' });
    }
    const slot = w / n, bw = Math.min(14, slot * 0.62);
    it.forEach((x, i) => {
      const cx = x0 + i * slot + slot / 2, bh = (x.ml / ymax) * h;
      if (x.ml > 0) {
        d.fill(x.goalMet ? (x.partial ? C.accentSoft : C.accent) : (x.partial ? C.accentPale : C.accentSoft));
        doc.rect(cx - bw / 2, base - bh, bw, bh, 'F');
        if (n <= 14) d.font(n <= 8 ? 7.4 : 6.4, 'bold', C.text).text(n <= 8 ? F.int(x.ml) : F.dec1(x.ml / 1000), cx, base - bh - 1.3, { align: 'center' });
      } else if (n <= 31) d.font(7, 'normal', C.muted).text('–', cx, base - 1.2, { align: 'center' });
      if (x.training) {
        d.fill(C.goal); doc.circle(cx, base + 2.6, n > 20 ? 0.8 : 1.1, 'F');
        if (week) d.font(6, 'normal', C.muted).text(String(x.training), cx + 1.6, base + 3.6);
      }
      const every = n <= 8 ? 1 : n <= 16 ? 2 : Math.ceil(n / 9);
      if (i % every === 0) {
        if (n <= 8) { d.font(7.4, 'bold', C.text).text(x.label, cx, base + 7, { align: 'center' }); d.font(6.8, 'normal', C.muted).text(x.date, cx, base + 10.3, { align: 'center' }); }
        else d.font(6.6, 'normal', C.muted).text(week ? x.label : x.date, cx, base + 7, { align: 'center' });
      }
    });
    // Ziel (Stufenlinie) und DGE-Richtwert
    doc.setLineWidth(0.45); d.stroke(C.goal).dash([1.6, 1]);
    it.forEach((x, i) => {
      const a = x0 + i * slot, b = a + slot; doc.line(a, Y(x.goal), b, Y(x.goal));
      if (i && it[i - 1].goal !== x.goal) doc.line(a, Y(it[i - 1].goal), a, Y(x.goal));
    });
    doc.setLineWidth(0.3); d.stroke(C.dge).dash([0.5, 0.8]); doc.line(x0, Y(s.dge), x0 + w, Y(s.dge)); d.dash(null);
    d.y = base + (n <= 8 ? 12 : 9);
    // Legende
    let lx = PAGE.ml + 11;
    const leg = (draw, label) => { draw(lx, d.y); d.font(7, 'normal', C.muted).text(label, lx + 5, d.y + 1); lx += 5 + d.width(label) + 6; };
    leg((x, y) => { d.fill(C.accent); doc.rect(x, y - 1.6, 3.2, 3.2, 'F'); }, 'Ziel erreicht');
    leg((x, y) => { d.fill(C.accentSoft); doc.rect(x, y - 1.6, 3.2, 3.2, 'F'); }, 'unter Ziel');
    leg((x, y) => { doc.setLineWidth(0.45); d.stroke(C.goal).dash([1.6, 1]); doc.line(x - 0.5, y, x + 4, y); d.dash(null); }, `Tagesziel (${F.int(goalBase())} / ${F.int(goalTraining())} ml)`);
    leg((x, y) => { doc.setLineWidth(0.3); d.stroke(C.dge).dash([0.5, 0.8]); doc.line(x - 0.5, y, x + 4, y); d.dash(null); }, `DGE-Richtwert ${F.ml(s.dge)}`);
    leg((x, y) => { d.fill(C.goal); doc.circle(x + 1.5, y, 1.1, 'F'); }, week ? 'Trainingstage (Anzahl)' : 'Trainingstag');
    if (s.todayExcluded) leg((x, y) => { d.fill(C.accentPale); doc.rect(x, y - 1.6, 3.2, 3.2, 'F'); }, 'heute (läuft)');
    d.y += 6;
  }
  const goalBase = () => (Emly.store.getSettings() || {}).goalBase || 1200;
  const goalTraining = () => (Emly.store.getSettings() || {}).goalTraining || 1700;

  function daypartChart(d, s, x, w) {
    const F = Emly.stats.fmt, doc = d.doc;
    let y = d.y;
    d.font(11, 'bold', C.text).text('Tageszeit-Verteilung', x, y + 4);
    d.font(7.4, 'normal', C.muted).text('Anteil an der Tagesmenge · Ø ml pro Tag', x, y + 8.4);
    y += 12;
    const lw = 27, vw = 25, tw = w - lw - vw;
    const maxV = Math.max(1, ...U.DAYPARTS.map(p => s.byDaypart[p.id]));
    U.DAYPARTS.forEach(p => {
      d.font(8, 'normal', C.text).text(p.label, x, y + 3);
      d.font(6.6, 'normal', C.muted).text(p.range, x, y + 6.2);
      d.fill(C.accentPale); doc.roundedRect(x + lw, y + 1, tw, 3.6, 1.8, 1.8, 'F');
      const v = s.byDaypart[p.id];
      if (v > 0) { d.fill(C.accent); doc.roundedRect(x + lw, y + 1, Math.max(3.6, tw * v / maxV), 3.6, 1.8, 1.8, 'F'); }
      d.font(8, 'bold', C.text).text(F.pct(s.byDaypartPct[p.id]), x + w, y + 3.3, { align: 'right' });
      d.font(6.6, 'normal', C.muted).text('Ø ' + F.ml(v), x + w, y + 6.3, { align: 'right' });
      y += 8.6;
    });
    return y;
  }

  function sidePanel(d, s, x, w) {
    const F = Emly.stats.fmt, doc = d.doc;
    let y = d.y;
    d.font(11, 'bold', C.text).text('Nächte', x, y + 4);
    d.font(7.4, 'normal', C.muted).text('jeweils die Nacht vor dem Tag, morgens erfragt', x, y + 8.4);
    y += 13;
    const rows = s.nightsAnswered ? [
      ['Nächte eingetragen', `${s.nightsAnswered} von ${s.daysInRange}`],
      ['davon mit Toilettengang', `${s.nightsWithToilet} (${F.pct(s.nightToiletRate)})`],
      ['Angabe zum Bett', s.nightsBedAnswered ? `${s.nightsBedAnswered} Nächte` : 'keine Angabe'],
      ...(s.nightsBedAnswered ? [['davon nicht ganz trocken', String(s.nightsNotDry)]] : [])
    ] : [['Nächte eingetragen', 'keine Angaben']];
    rows.forEach((r, i) => {
      if (i % 2 === 0) { d.fill(C.zebra); doc.rect(x, y - 3.6, w, 5.4, 'F'); }
      d.font(8, 'normal', C.text).text(r[0], x + 1.5, y); d.font(8, 'bold', C.text).text(r[1], x + w - 1.5, y, { align: 'right' });
      y += 5.4;
    });
    y += 4;
    d.font(11, 'bold', C.text).text('Muster im Zeitraum', x, y + 1);
    y += 6;
    s.patternNotesReport.forEach(t => {
      const lines = doc.splitTextToSize(safe(t), w - 4);
      d.fill(C.accent); doc.circle(x + 1, y - 1, 0.7, 'F');
      d.font(8.2, 'normal', C.text); doc.text(lines, x + 4, y);
      y += lines.length * 3.6 + 1.6;
    });
    return y;
  }

  function footnote(d, s) {
    const doc = d.doc, F = Emly.stats.fmt;
    const txt = [
      `Richtwert: DGE-Referenzwert für die Wasserzufuhr durch Getränke, 10 bis unter 13 Jahre: ca. ${F.ml(s.dge)} pro Tag. Persönliches Tagesziel in der App: ${F.ml(goalBase())} (Schultag) bzw. ${F.ml(goalTraining())} (Trainingstag).`,
      'Selbstprotokoll eines Kindes per App. Uhrzeiten werden teils nachträglich über Zeit-Auswahl (z. B. „Mittag 13:00“) eingetragen und sind dann gerundet. Einträge vor 4 Uhr zählen zum Vortag.',
      'Tageszeiten: Morgens 4–9, Vormittags 9–12, Mittags 12–14, Nachmittags 14–18, Abends 18–21 Uhr, Spät/Nacht ab 21 Uhr.'
    ];
    const lines = txt.flatMap(t => doc.splitTextToSize(safe(t), CW - 6));
    const h = lines.length * 3.2 + 5;
    d.ensure(h + 2);
    d.fill(C.zebra); doc.roundedRect(PAGE.ml, d.y, CW, h, 2, 2, 'F');
    d.font(7.2, 'normal', C.muted); doc.text(lines, PAGE.ml + 3, d.y + 4.3, { lineHeightFactor: 1.25 });
    d.y += h + 4;
  }

  /* ---------- Tabellen ---------- */
  /** cols: [{t:'Datum', w:22, a:'left'|'right'|'center'}]; rows: [{cells:[], muted?, bold?, fill?}] */
  function table(d, title, sub, cols, rows, opts) {
    opts = opts || {};
    const doc = d.doc, rh = opts.rh || 5.6, hh = 7;
    const drawHead = cont => {
      if (title) {
        d.font(12.5, 'bold', C.text).text(title + (cont ? ' (Fortsetzung)' : ''), PAGE.ml, d.y + 4.5);
        if (sub && !cont) {   // Untertitel umbrechen (Abnahme: lief rechts aus der Seite)
          d.font(8, 'normal', C.muted);
          const lines = doc.splitTextToSize(safe(sub), CW);
          lines.forEach((ln, i) => d.text(ln, PAGE.ml, d.y + 9.2 + i * 3.6));
          d.y += 4.5 + (lines.length - 1) * 3.6;
        }
        d.y += 8;
      }
      d.fill(C.accent); doc.rect(PAGE.ml, d.y, CW, hh, 'F');
      let x = PAGE.ml;
      d.font(7.6, 'bold', C.white);
      cols.forEach(c => { tx(d, c.t, x, c.w, d.y + 4.6, c.a); x += c.w; });
      d.y += hh;
    };
    if (d.y + (title ? 14 : 0) + hh + rh * 2 > d.bottom) d.newPage();
    drawHead(false);
    rows.forEach((r, i) => {
      if (d.y + rh > d.bottom) { d.newPage(); drawHead(true); }
      if (r.fill) { d.fill(r.fill); doc.rect(PAGE.ml, d.y, CW, rh, 'F'); }
      else if (i % 2 === 1) { d.fill(C.zebra); doc.rect(PAGE.ml, d.y, CW, rh, 'F'); }
      let x = PAGE.ml;
      cols.forEach((c, j) => {
        d.font(8, r.bold ? 'bold' : 'normal', r.muted && j > 1 ? C.muted : C.text);
        tx(d, r.cells[j], x, c.w, d.y + rh / 2 + 1.25, c.a);
        x += c.w;
      });
      d.y += rh;
    });
    d.stroke(C.line); doc.setLineWidth(0.3); doc.line(PAGE.ml, d.y, PAGE.ml + CW, d.y);
    d.y += 6;
  }
  function tx(d, s, x, w, y, a) {
    const pad = 1.8, str = d.fit(s, w - 2 * pad);
    if (a === 'right') d.text(str, x + w - pad, y, { align: 'right' });
    else if (a === 'center') d.text(str, x + w / 2, y, { align: 'center' });
    else d.text(str, x + pad, y);
  }

  function dayTable(d, s) {
    const F = Emly.stats.fmt;
    const cols = [
      { t: 'Datum', w: 22 }, { t: 'Tag', w: 11 }, { t: 'Training', w: 16, a: 'center' }, { t: 'Getrunken', w: 21, a: 'right' },
      { t: 'Ziel', w: 18, a: 'right' }, { t: '%', w: 14, a: 'right' }, { t: 'Toilette', w: 17, a: 'right' },
      { t: 'Getränke', w: 17, a: 'right' }, { t: 'Nacht: Toilette', w: 23, a: 'center' }, { t: 'Nacht: Bett', w: 19, a: 'center' }
    ]; // Summe 178
    const rows = s.days.map(t => {
      const nb = t.nightBefore;
      return {
        muted: !t.hasData,
        cells: [U.fmtDate(t.key), U.weekday(t.key), F.training(t.training),
          t.hasData ? F.int(t.ml) + (t.isToday ? '*' : '') : '–', F.int(t.goal), t.hasData ? F.pct(t.pct) : '–',
          t.hasData ? String(t.toilets) : '–', t.hasData ? String(t.drinks) : '–',
          F.nightToilet(nb), nb && nb.bed ? (nb.bed === 'trocken' ? 'trocken' : 'nicht ganz') : '–']
      };
    });
    if (s.basisDays) {
      rows.push({
        bold: true, fill: C.accentPale,
        cells: [`Ø ${s.basisDays} Tage`, '', `${s.trainingDays} von ${s.daysInRange}`, F.int(s.avgMl), F.int(s.avgGoal), F.pct(s.avgGoal ? s.avgMl / s.avgGoal * 100 : 0), F.dec1(s.avgToilets), '',
          s.nightsAnswered ? `${s.nightsWithToilet} von ${s.nightsAnswered}` : '–', s.nightsBedAnswered ? `${s.nightsNotDry} von ${s.nightsBedAnswered}` : '–']
      });
    }
    table(d, 'Tagesübersicht', `Mengen in ml. Ziel = persönliches Tagesziel (Trainingstag höher). Nacht = Nacht vor dem Tag.${s.todayExcluded ? ' * heute, Tag läuft noch.' : ''}` +
      (s.basisDays ? ` Letzte Zeile: Mengen, % und Toilette = Ø je erfasstem Tag${s.todayExcluded ? ' (ohne heute)' : ''}; Training und Nacht = Anzahl Tage/Nächte im Zeitraum.` : ''), cols, rows);
  }

  function detail(d, s) {
    const doc = d.doc, F = Emly.stats.fmt, st = Emly.store;
    const dsh = (st.getSettings() || {}).dayStartHour ?? 4;
    const days = s.days.filter(t => t.hasData || t.nightBefore);
    if (!days.length) return;
    d.ensure(48);
    d.font(12.5, 'bold', C.text).text('Detailprotokoll', PAGE.ml, d.y + 4.5);
    d.font(8, 'normal', C.muted).text('Trink- und Miktionsprotokoll: alle Einträge je Tag mit Uhrzeit. „(+1)“ = nach Mitternacht, zählt zum Vortag.', PAGE.ml, d.y + 9.2);
    d.y += 15;
    const cols = [{ t: 'Uhrzeit', w: 22 }, { t: 'Getränk', w: 52 }, { t: 'Menge', w: 30, a: 'right' }, { t: 'Einheit', w: 34 }, { t: 'Toilette', w: 40, a: 'center' }];
    const rh = 4.9, hh = 6;
    const dayHead = (t, cont) => {
      d.fill(C.accentPale); doc.rect(PAGE.ml, d.y, CW, 8, 'F');
      d.fill(C.accent); doc.rect(PAGE.ml, d.y, 1, 8, 'F');
      d.font(9, 'bold', C.text).text(`${U.weekdayLong(t.key)}, ${U.fmtDate(t.key)}${cont ? ' (Fortsetzung)' : ''}`, PAGE.ml + 3.5, d.y + 5.3);
      const nb = t.nightBefore;
      const info = [t.training === true ? 'Training' : t.training === false ? 'kein Training' : 'Training: keine Angabe',
        'Nacht davor: ' + (nb && typeof nb.toilet === 'number' ? 'Toilette ' + F.nightToilet(nb) + (nb.bed ? ', Bett ' + F.bed(nb) : '') : 'keine Angabe')].join('  ·  ');
      d.font(7.6, 'normal', C.muted).text(info, PAGE.ml + CW - 2, d.y + 5.3, { align: 'right' });
      d.y += 8;
      d.stroke(C.line); doc.setLineWidth(0.25);
      let x = PAGE.ml; d.font(7.2, 'bold', C.muted);
      cols.forEach(c => { tx(d, c.t, x, c.w, d.y + 4.2, c.a); x += c.w; });
      d.y += hh; doc.line(PAGE.ml, d.y, PAGE.ml + CW, d.y);
    };
    days.forEach(t => {
      const es = (st.entriesForDay(t.key) || []).slice().sort((a, b) => (a.ts < b.ts ? -1 : 1));
      const need = 8 + hh + Math.min(3, Math.max(1, es.length)) * rh;
      if (d.y + need > d.bottom) d.newPage();
      dayHead(t, false);
      if (!es.length) { d.font(8, 'normal', C.muted).text('keine Einträge', PAGE.ml + 1.8, d.y + 3.8); d.y += rh; }
      es.forEach((e, i) => {
        if (d.y + rh > d.bottom) { d.newPage(); dayHead(t, true); }
        if (i % 2 === 1) { d.fill(C.zebra); doc.rect(PAGE.ml, d.y, CW, rh, 'F'); }
        const hr = new Date(e.ts).getHours();
        const time = U.fmtTime(e.ts) + (hr < dsh ? ' (+1)' : '');
        const cells = e.type === 'drink'
          ? [time, Emly.stats.DRINK_LABEL[e.drink] || 'Getränk', F.ml(e.ml), Emly.stats.UNIT_LABEL[e.unit] || '', '']
          : [time, '', '', '', 'Toilettengang'];
        let x = PAGE.ml;
        cols.forEach((c, j) => {
          d.font(8, j === 4 && cells[4] ? 'bold' : 'normal', j === 4 ? C.accent : C.text);
          tx(d, cells[j], x, c.w, d.y + rh / 2 + 1.2, c.a); x += c.w;
        });
        d.y += rh;
      });
      if (d.y + rh > d.bottom) d.newPage();
      d.stroke(C.line); doc.setLineWidth(0.25); doc.line(PAGE.ml, d.y, PAGE.ml + CW, d.y);
      d.font(7.8, 'bold', C.text).text(`Summe: ${F.ml(t.ml)} in ${t.drinks} ${t.drinks === 1 ? 'Getränk' : 'Getränken'}${t.firstDrinkTs ? ` (${U.fmtTime(t.firstDrinkTs)}–${U.fmtTime(t.lastDrinkTs)} Uhr)` : ''}  ·  ${t.toilets} ${t.toilets === 1 ? 'Toilettengang' : 'Toilettengänge'}${t.isToday ? '  ·  Tag läuft noch' : ''}`, PAGE.ml + 1.8, d.y + 4);
      d.y += 10;
    });
  }

  function footer(doc, p, name) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      const y = PAGE.h - 9;
      doc.setDrawColor(...C.line); doc.setLineWidth(0.25); doc.line(PAGE.ml, y - 4, PAGE.w - PAGE.mr, y - 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.4); doc.setTextColor(...C.muted);
      doc.text(safe(`Trink- & Toilettenprotokoll · ${name} · ${p.label}`), PAGE.ml, y);
      doc.text(safe(`Erstellt mit Emly · lokal auf dem Gerät · Seite ${i}/${n}`), PAGE.w - PAGE.mr, y, { align: 'right' });
    }
  }

  /* ---------- öffentliche API ---------- */
  async function build(kind, opts) {
    opts = opts || {};
    await new Promise(r => setTimeout(r, 0)); // UI (Lade-Hinweis) zuerst zeichnen lassen
    const p = Emly.stats.period(kind);
    const s = Emly.stats.summary(p.from, p.to);
    const name = safe((Emly.store.getSettings() || {}).name || '') || '';
    const doc = create(), d = mk(doc);
    header(d, p, s, name);
    if (s.isEmpty) {
      d.fill(C.zebra); doc.roundedRect(PAGE.ml, d.y, CW, 26, 2, 2, 'F');
      d.font(13, 'bold', C.text).text('Noch keine Daten', PAGE.ml + CW / 2, d.y + 11, { align: 'center' });
      d.font(9, 'normal', C.muted).text('Für diesen Zeitraum wurden noch keine Getränke, Toilettengänge oder Nächte eingetragen.', PAGE.ml + CW / 2, d.y + 18, { align: 'center' });
      d.y += 32;
      footnote(d, s);
    } else {
      kpis(d, s);
      barChart(d, s);
      const colW = (CW - 10) / 2, y0 = d.y;
      const yl = daypartChart(d, s, PAGE.ml, colW);
      d.y = y0;
      const yr = sidePanel(d, s, PAGE.ml + colW + 10, colW);
      d.y = Math.max(yl, yr) + 4;
      footnote(d, s);
      d.newPage();
      dayTable(d, s);
      const withDetail = opts.detail != null ? opts.detail : p.kind === 'woche';
      if (withDetail) detail(d, s);
    }
    footer(doc, p, name);
    return doc.output('blob');
  }

  function fileName(kind) { return `Emly-Bericht_${kind}_${Emly.store.todayKey ? Emly.store.todayKey() : U.calKey(new Date())}.pdf`; }

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function toast(msg, o) { try { Emly.ui && Emly.ui.toast ? Emly.ui.toast(msg, o) : console.info('[emly]', msg); } catch (e) { /* noop */ } }

  let busy = false;
  async function share(kind) {
    if (busy) return 'busy';
    busy = true;
    // Lade-Hinweis nur, wenn der Bericht-Screen nicht schon einen Spinner zeigt
    if (!document.querySelector('.r-pdf[disabled]')) toast('PDF wird erstellt …', { duration: 1800 });
    try {
      const blob = await build(kind);
      const name = fileName(kind);
      const p = Emly.stats.period(kind);
      const nm = (Emly.store.getSettings() || {}).name || '';
      const file = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null;
      const data = { files: [file], title: `Emly-Bericht ${Emly.stats.KIND_LABEL[p.kind] || ''}`.trim(), text: `Trink- & Toilettenprotokoll${nm ? ' von ' + nm : ''} (${p.label})` };
      const canShare = file && navigator.share && navigator.canShare && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })();
      if (!canShare) { download(blob, name); toast('PDF gespeichert – zu finden unter „Downloads“.'); return 'downloaded'; }
      try {
        await navigator.share(data);
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'aborted';
        if (e && e.name === 'NotAllowedError') {
          // Nutzergeste abgelaufen (Erstellung dauerte zu lange) → mit neuem Tap teilen
          toast('PDF ist fertig.', { duration: 8000, actions: [
            { label: 'Teilen', onClick: () => navigator.share(data).catch(err => { if (!err || err.name !== 'AbortError') download(blob, name); }) },
            { label: 'Speichern', onClick: () => download(blob, name) }] });
          return 'deferred';
        }
        console.warn('[pdf] share fehlgeschlagen, Download', e);
        download(blob, name); toast('Teilen ging nicht – PDF wurde gespeichert.');
        return 'downloaded';
      }
    } finally { busy = false; }
  }

  Emly.pdf = { build, share, fileName, _safe: safe };
})();
