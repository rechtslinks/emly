/* Emly – game.js (Mira / Dev C)
 * Emly.game: XP, Level, Streaks, Abzeichen, Theme-Freischaltung – deterministisch aus Store-Daten.
 * Grundsatz (SPEC §1.2): belohnt wird Eintragen & Trinken. NIE trockene Nächte. Morgen-Check zählt egal welche Antwort.
 * Screen 'erfolge' (order 20).
 */
(function () {
  'use strict';
  const Emly = (window.Emly = window.Emly || {});
  const U = Emly.util;

  /* ---------- Konstanten ---------- */
  const LEVELS = [
    { name: 'Tröpfchen', xp: 0 }, { name: 'Pfütze', xp: 120 }, { name: 'Bächlein', xp: 350 }, { name: 'Quelle', xp: 700 },
    { name: 'Fluss', xp: 1200 }, { name: 'Wasserfall', xp: 1900 }, { name: 'See', xp: 2800 },
    // PO-Entscheidung (Abnahme): Level 8–10 gestreckt = Langzeitziel. Bei ~150 XP/Tag:
    // Meer nach ~6 Wochen, Ozean nach ~3 Monaten, Wasser-Legende nach ~6½ Monaten.
    { name: 'Meer', xp: 6000 }, { name: 'Ozean', xp: 13500 }, { name: 'Wasser-Legende', xp: 29000 }
  ];
  const XP = { perMl: 20, capPct: 1.6, toilet: 5, toiletMaxPerDay: 10, morning: 10, training: 10, goal: 30 };
  const THEMES = [
    { id: 'lagune', name: 'Lagune', level: 1 }, { id: 'beere', name: 'Beere', level: 3 },
    { id: 'sunset', name: 'Sunset', level: 5 }, { id: 'mint', name: 'Mint', level: 7 }
  ];

  // Abzeichen: id, Name, Beschreibung, Icon, Ziel, Farbverlauf (b1→b2)
  const BADGES = [
    { id: 'erster-schluck', name: 'Erster Schluck', desc: 'Dein allererstes Getränk eingetragen.', icon: 'drop', target: 1, c: ['#3FD0F0', '#2F7BF0'] },
    { id: 'fruehstarter', name: 'Frühstarter', desc: 'An 5 Tagen vor 8 Uhr etwas getrunken.', icon: 'sunrise', target: 5, c: ['#FFCF4A', '#FF8A3D'] },
    { id: 'schul-profi', name: 'Schul-Profi', desc: 'An 5 Tagen vormittags (9–12 Uhr) mindestens 300 ml.', icon: 'backpack', target: 5, c: ['#7C8CFF', '#5B4BD8'] },
    { id: 'trainings-heldin', name: 'Trainings-Heldin', desc: 'An einem Trainingstag dein Tagesziel geschafft.', icon: 'ball', target: 1, c: ['#3EE0A6', '#0EA57A'] },
    { id: 'streak-3', name: '3-Tage-Serie', desc: '3 Tage hintereinander das Tagesziel erreicht.', icon: 'flame', target: 3, c: ['#FFB347', '#FF7A45'] },
    { id: 'streak-7', name: '7-Tage-Serie', desc: '7 Tage hintereinander das Tagesziel erreicht.', icon: 'flame', target: 7, c: ['#FF9F5A', '#F2507A'] },
    { id: 'streak-14', name: '14-Tage-Serie', desc: '14 Tage hintereinander das Tagesziel erreicht.', icon: 'flame', target: 14, c: ['#F86CA7', '#B44DF0'] },
    { id: 'streak-30', name: '30-Tage-Serie', desc: '30 Tage hintereinander das Tagesziel erreicht. Legendär!', icon: 'bolt', target: 30, c: ['#B66CFF', '#5B4BD8'] },
    { id: 'morgen-routine', name: 'Morgen-Routine', desc: '7 Morgen-Checks beantwortet – egal mit welcher Antwort.', icon: 'sun', target: 7, c: ['#FFD35C', '#FFA51F'] },
    { id: 'foto-fan', name: 'Foto-Fan', desc: '5 Getränke mit Foto eingetragen.', icon: 'camera', target: 5, c: ['#FF8FB1', '#E64598'] },
    { id: 'flaschen-queen', name: 'Flaschen-Queen', desc: '20 ganze Trinkflaschen eingetragen.', icon: 'crown', target: 20, c: ['#FFD35C', '#F59E0B'] },
    { id: 'wochen-champion', name: 'Wochen-Champion', desc: '7 Tage am Stück alles eingetragen: Getränke, Training und Morgen-Check.', icon: 'medal', target: 7, c: ['#34D6A2', '#0EA5B7'] },
    { id: 'tagebuch-profi', name: 'Tagebuch-Profi', desc: 'An 30 verschiedenen Tagen Einträge gemacht.', icon: 'book', target: 30, c: ['#5BD0F5', '#6C5CE7'] },
    { id: '10-liter-club', name: '10-Liter-Club', desc: 'Insgesamt 10 Liter getrunken.', icon: 'wave', target: 10000, unit: 'ml', c: ['#22D3EE', '#2563EB'] },
    { id: '100-liter-club', name: '100-Liter-Club', desc: 'Insgesamt 100 Liter getrunken. Ein ganzes Aquarium!', icon: 'gem', target: 100000, unit: 'ml', c: ['#A78BFA', '#22B8D9'] }
  ];

  const store = () => Emly.store;
  const ready = () => !!(store() && store().getState && store().dayTotals && store().dayKeysWithData);

  function levelFor(xp) {
    let i = 0;
    while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1].xp) i++;
    return i + 1;
  }

  /* ---------- Kernberechnung ---------- */
  function compute() {
    const empty = {
      xp: 0, level: 1, levelName: LEVELS[0].name, levelXp: 0, nextLevelXp: LEVELS[1].xp, nextLevelName: LEVELS[1].name,
      progress: 0, streak: 0, bestStreak: 0, logStreak: 0, todayXp: 0, totalMl: 0, unlockedCount: 0,
      badges: BADGES.map(b => badgeOut(b, 0, null))
    };
    if (!ready()) return empty;
    const S = store();
    const state = S.getState() || {};
    const settings = state.settings || {};
    const dayStart = settings.dayStartHour == null ? 4 : settings.dayStartHour;
    const keys = (S.dayKeysWithData() || []).slice().sort();
    const today = S.todayKey ? S.todayKey() : U.calKey(new Date());

    // Einträge nach Tag gruppieren (für Zeit-/Einheiten-Badges)
    const entries = (state.entries || []).slice().sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
    const byDay = {};
    entries.forEach(e => { const k = S.dayKeyOf(e.ts); (byDay[k] = byDay[k] || []).push(e); });

    const T = {}; keys.forEach(k => { try { T[k] = S.dayTotals(k); } catch (e) { T[k] = null; } });

    let xp = 0, todayXp = 0, totalMl = 0;
    const dates = {};                      // badgeId → dayKey der Freischaltung
    const prog = {};                       // badgeId → Fortschritt
    const hit = (id, val, key) => { prog[id] = Math.max(prog[id] || 0, val); const b = BADGES_BY[id]; if (!dates[id] && val >= b.target) dates[id] = key; };

    // Eintrags-basierte Badges (chronologisch)
    let drinks = 0, photos = 0, bottles = 0;
    entries.forEach(e => {
      if (e.type !== 'drink') return;
      const k = S.dayKeyOf(e.ts);
      drinks++; hit('erster-schluck', drinks, k);
      if (e.photoId) { photos++; hit('foto-fan', photos, k); }
      if (e.unit === 'bottle') { bottles++; hit('flaschen-queen', bottles, k); }
    });

    // Tages-basierte Werte (chronologisch über Tage mit Daten)
    let early = 0, school = 0, trainGoal = 0, mornings = 0, loggedDays = 0;
    keys.forEach(k => {
      const t = T[k]; if (!t) return;
      const ml = +t.ml || 0, goal = +t.goal || (S.goalFor ? S.goalFor(k) : 1200);
      const toilets = typeof t.toilets === 'number' ? t.toilets : (byDay[k] || []).filter(e => e.type === 'toilet').length;
      let dx = Math.floor(Math.min(ml, goal * XP.capPct) / XP.perMl);
      dx += XP.toilet * Math.min(toilets, XP.toiletMaxPerDay);
      if (t.nightBefore) dx += XP.morning;                  // jede Antwort zählt gleich
      if (t.training === true || t.training === false) dx += XP.training;
      if (goal > 0 && ml >= goal) dx += XP.goal;
      xp += dx; if (k === today) todayXp = dx;

      totalMl += ml;
      hit('10-liter-club', totalMl, k); hit('100-liter-club', totalMl, k);
      if ((byDay[k] || []).length) { loggedDays++; hit('tagebuch-profi', loggedDays, k); }
      const hasEarly = (byDay[k] || []).some(e => { if (e.type !== 'drink') return false; const h = new Date(e.ts).getHours(); return h >= dayStart && h < 8; });
      if (hasEarly) { early++; hit('fruehstarter', early, k); }
      const vm = t.byDaypart && +t.byDaypart.vormittags || 0;
      if (vm >= 300) { school++; hit('schul-profi', school, k); }
      if (t.training === true && goal > 0 && ml >= goal) { trainGoal++; hit('trainings-heldin', trainGoal, k); }
      if (t.nightBefore) { mornings++; hit('morgen-routine', mornings, k); }
    });

    // Serien über den Kalender (Lücken unterbrechen)
    let run = 0, best = 0, fullRun = 0, bestFull = 0, logRun = 0;
    const goalMet = k => { const t = T[k]; return !!(t && t.goal > 0 && t.ml >= t.goal); };
    const complete = k => { const t = T[k]; return !!(t && (t.ml > 0) && t.training != null && t.nightBefore); };
    if (keys.length) {
      const last = keys[keys.length - 1] > today ? keys[keys.length - 1] : today;
      U.range(keys[0], last).forEach(k => {
        if (goalMet(k)) { run++; best = Math.max(best, run); [3, 7, 14, 30].forEach(n => hit('streak-' + n, run, k)); }
        else if (k !== today) run = 0;                      // heute noch offen → Serie bleibt
        if (complete(k)) { fullRun++; bestFull = Math.max(bestFull, fullRun); hit('wochen-champion', fullRun, k); }
        else if (k !== today) fullRun = 0;
      });
      // Eintrags-Serie (Tage mit irgendeinem Eintrag) bis heute bzw. gestern
      let k = (byDay[today] && byDay[today].length) ? today : U.addDays(today, -1);
      while (byDay[k] && byDay[k].length) { logRun++; k = U.addDays(k, -1); }
    }
    const current = run;  // Lauf endet heute (wenn erreicht) oder gestern
    ['streak-3', 'streak-7', 'streak-14', 'streak-30'].forEach(id => { prog[id] = Math.max(prog[id] || 0, best); });
    prog['wochen-champion'] = Math.max(prog['wochen-champion'] || 0, bestFull);

    const level = levelFor(xp);
    const cur = LEVELS[level - 1], nxt = LEVELS[level] || null;
    const badges = BADGES.map(b => badgeOut(b, prog[b.id] || 0, dates[b.id] || null));
    return {
      xp, level, levelName: cur.name, levelXp: cur.xp,
      nextLevelXp: nxt ? nxt.xp : null, nextLevelName: nxt ? nxt.name : null,
      progress: nxt ? (xp - cur.xp) / (nxt.xp - cur.xp) : 1,
      streak: current, bestStreak: best, logStreak: logRun, todayXp, totalMl,
      unlockedCount: badges.filter(b => b.unlocked).length,
      badges
    };
  }
  const BADGES_BY = {}; BADGES.forEach(b => { BADGES_BY[b.id] = b; });

  function badgeOut(b, value, date) {
    const unlocked = !!date;
    const v = Math.min(value, b.target);
    const fmt = n => b.unit === 'ml' ? (Math.floor(n / 100) / 10).toLocaleString('de-DE') : String(n);
    return {
      id: b.id, name: b.name, desc: b.desc, icon: b.icon, unlocked, date: date || undefined,
      value: v, target: b.target, colors: b.c,
      progressText: b.unit === 'ml' ? fmt(v) + ' / ' + fmt(b.target) + ' l' : v + '/' + b.target
    };
  }

  /* ---------- Themes ---------- */
  function themesForLevel(level) { return THEMES.filter(t => level >= t.level).map(t => t.id); }
  function unlockedThemes() {
    const g = (ready() && store().getGame && store().getGame()) || {};
    const set = new Set(['lagune'].concat(g.unlockedThemes || []));
    themesForLevel(compute().level).forEach(t => set.add(t));
    return THEMES.map(t => t.id).filter(id => set.has(id));
  }
  function themeInfo() {
    const un = unlockedThemes();
    return THEMES.map(t => Object.assign({}, t, { unlocked: un.includes(t.id) }));
  }

  /* ---------- Neu-Erkennung & Feier ---------- */
  let pending = null, checkTimer = null, lastResult = null;

  function check(opts) {
    const o = opts || {};
    if (!ready() || !store().getGame || !store().setGame) return null;
    const r = compute(); lastResult = r;
    const g = store().getGame() || {};
    const seen = g.seenBadges || [];
    const unlocked = r.badges.filter(b => b.unlocked).map(b => b.id);
    const newBadges = unlocked.filter(id => !seen.includes(id));
    const lastLevel = g.lastLevel || 1;
    const levelUp = r.level > lastLevel;
    const oldThemes = g.unlockedThemes && g.unlockedThemes.length ? g.unlockedThemes : ['lagune'];
    const themes = Array.from(new Set(oldThemes.concat(themesForLevel(r.level)).concat(['lagune'])));
    const newThemes = themes.filter(t => !oldThemes.includes(t));

    if (newBadges.length || levelUp || newThemes.length || !g.unlockedThemes) {
      store().setGame({
        seenBadges: Array.from(new Set(seen.concat(unlocked))),
        lastLevel: Math.max(lastLevel, r.level),
        unlockedThemes: themes
      });
    }
    if (!o.silent && (newBadges.length || levelUp)) {
      const prev = pending || { badges: [], levelUp: false, themes: [] };
      pending = {
        badges: Array.from(new Set(prev.badges.concat(newBadges))),
        levelUp: prev.levelUp || levelUp, level: r.level, levelName: r.levelName,
        themes: Array.from(new Set(prev.themes.concat(newThemes)))
      };
      setTimeout(flush, 650);    // Bestätigungs-Toast der Eingabe zuerst sehen lassen
    }
    return { newBadges, levelUp, newThemes, result: r };
  }

  function canCelebrate() {
    if (document.hidden) return false;
    if (document.querySelector('.e-onb')) return false;
    if (Emly.ui && Emly.ui.isToastOpen && Emly.ui.isToastOpen()) return false;   // erst „Rückgängig“-Chance lassen
    return !(Emly.ui && Emly.ui.isSheetOpen && Emly.ui.isSheetOpen());
  }

  function flush() {
    if (!pending || !Emly.ui) return;
    if (!canCelebrate()) return;    // wird bei ui:sheet-closed / visibilitychange erneut versucht
    const p = pending; pending = null;
    const ui = Emly.ui, h = U.h;
    const now = compute();                                   // erneut prüfen: evtl. inzwischen rückgängig gemacht
    const items = p.badges.map(id => now.badges.find(b => b.id === id)).filter(b => b && b.unlocked);
    if (p.levelUp && now.level < p.level) p.levelUp = false;
    if (!items.length && !p.levelUp) return;
    const body = h('div', { class: 'e-badge-hero' });
    let title = 'Neues Abzeichen!';
    if (p.levelUp && !items.length) {
      title = 'Level geschafft!';
      body.append(levelMedal(p.level),
        h('div', { class: 'e-h2' }, 'Level ' + p.level + ': ' + p.levelName),
        h('p', null, 'Stark! Du sammelst fleißig XP – weiter so.'));
    } else {
      if (items.length > 1) title = items.length + ' neue Abzeichen!';
      if (items.length === 1) {
        body.append(medal(items[0]), h('div', { class: 'e-h2' }, items[0].name), h('p', null, items[0].desc));
      } else {
        const row = h('div', { class: 'e-badge-hero__row' });
        items.forEach(b => row.append(h('div', { class: 'e-stack-sm', style: { alignItems: 'center', width: '84px' } }, medal(b), h('div', { class: 'e-badge__name', style: { justifyContent: 'center' } }, b.name))));
        body.append(row);
      }
      if (p.levelUp) body.append(h('div', { class: 'e-pill' }, icoEl('star'), 'Außerdem: Level ' + p.level + ' · ' + p.levelName));
    }
    const actions = [];
    if (p.themes.length) {
      const t = THEMES.find(x => x.id === p.themes[p.themes.length - 1]);
      body.append(h('div', { class: 'e-card e-card--soft e-row', style: { textAlign: 'left', width: '100%' } },
        h('span', { class: 'e-ico-bubble e-ico-bubble--grad', html: ui.icon('palette') }),
        h('div', { class: 'e-grow' }, h('div', { class: 'e-strong' }, 'Neues Farbthema: ' + t.name), h('div', { class: 'e-sub' }, 'Jetzt in „Mehr“ verfügbar.'))));
      actions.push({ label: 'Ausprobieren', onClick: () => { try { store().updateSettings({ theme: t.id }); } catch (e) { console.error(e); } } });
    } else if (location.hash !== '#erfolge') {
      actions.push({ label: 'Ansehen', onClick: () => { location.hash = '#erfolge'; } });
    }
    actions.push({ label: 'Mega!', primary: true });
    ui.sheet({ title, body, actions });
    ui.confetti(); ui.sound('yay'); ui.haptic([30, 40, 30]);
  }

  /* ---------- Darstellung ---------- */
  function medal(b, opts) {
    const o = opts || {};
    const el = U.h('div', { class: 'e-badge__medal', html: Emly.ui.icon(b.icon) });
    if (b.colors) { el.style.setProperty('--b1', b.colors[0]); el.style.setProperty('--b2', b.colors[1]); }
    if (o.locked) el.append(U.h('span', { class: 'e-badge__lock', html: Emly.ui.icon('lock') }));
    return el;
  }
  function levelMedal(level) {
    const el = U.h('div', { class: 'e-badge__medal', style: { background: 'var(--grad)' } });
    el.append(U.h('span', { style: { fontSize: '40px', fontWeight: '850', letterSpacing: '-.04em' } }, String(level)));
    return el;
  }
  function ring(progress, level) {
    const r = 48, c = 2 * Math.PI * r;
    const p = U.clamp(progress, 0, 1);
    return `<div class="e-ring" role="img" aria-label="Level ${level}, ${Math.round(p * 100)} % bis zum nächsten Level">
      <svg viewBox="0 0 112 112"><circle class="e-ring__track" cx="56" cy="56" r="${r}" stroke-width="10"/>
      <circle class="e-ring__val" cx="56" cy="56" r="${r}" stroke-width="10" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-offset="${(c * (1 - Math.max(p, 0.015))).toFixed(1)}"/></svg>
      <div class="e-ring__center"><span class="e-ring__lvl">Level</span><span class="e-ring__num">${level}</span></div></div>`;
  }
  const icoEl = (n) => U.h('span', { html: Emly.ui.icon(n) }).firstElementChild;
  const fmtNum = n => Math.round(n).toLocaleString('de-DE');
  const fmtDay = k => k ? U.weekday(k) + ', ' + U.fmtDate(k) : '';

  function openBadge(b) {
    const ui = Emly.ui, h = U.h;
    const body = h('div', { class: 'e-badge-hero' }, medal(b, { locked: !b.unlocked }),
      h('div', { class: 'e-h2' }, b.name), h('p', null, b.desc));
    if (b.unlocked) body.append(h('div', { class: 'e-pill' }, icoEl('check'), 'Geschafft am ' + fmtDay(b.date)));
    else {
      const pct = Math.round(b.value / b.target * 100);
      body.append(h('div', { style: { width: '100%', maxWidth: '260px' } },
        h('div', { class: 'e-row e-row--between e-small e-strong', style: { marginBottom: '6px' } }, h('span', null, 'Fortschritt'), h('span', { class: 'e-num' }, b.progressText)),
        h('div', { class: 'e-progress' }, h('div', { class: 'e-progress__bar', style: { width: pct + '%' } }))));
    }
    ui.sheet({ title: b.unlocked ? 'Abzeichen' : 'Noch gesperrt', body, actions: [{ label: 'Okay', primary: true }] });
  }

  function render(el) {
    const ui = Emly.ui, h = U.h;
    const r = compute();
    const s = (ready() && store().getSettings && store().getSettings()) || {};
    el.innerHTML = '';
    const scr = h('div', { class: 'e-screen' });

    scr.append(h('header', { class: 'e-header' },
      h('div', { class: 'e-header__text' }, h('h1', { class: 'e-h1' }, 'Erfolge'), h('div', { class: 'e-sub' }, 'Sammle XP fürs Trinken und Eintragen')),
      h('span', { class: 'e-ico-bubble e-ico-bubble--grad', html: ui.icon('trophy') })));

    // Level-Karte
    const toNext = r.nextLevelXp == null ? 0 : r.nextLevelXp - r.xp;
    const lvl = h('section', { class: 'e-card e-card--grad' },
      h('div', { class: 'e-level' },
        h('div', { html: ring(r.progress, r.level) }).firstElementChild,
        h('div', { class: 'e-level__info' },
          h('div', { class: 'e-row', style: { gap: '6px' } }, h('span', { class: 'e-pill e-pill--white' }, icoEl('sparkle'), fmtNum(r.xp) + ' XP'),
            r.todayXp ? h('span', { class: 'e-pill e-pill--white' }, '+' + r.todayXp + ' heute') : null),
          h('div', { class: 'e-level__name' }, r.levelName),
          r.nextLevelXp == null
            ? h('div', { class: 'e-level__xp' }, 'Höchstes Level erreicht – Wasser-Legende!')
            : h('div', { class: 'e-level__xp' }, 'Noch ' + fmtNum(toNext) + ' XP bis ', h('b', null, r.nextLevelName)),
          h('div', { class: 'e-progress' }, h('div', { class: 'e-progress__bar', 'data-w': Math.round(r.progress * 100) })))));
    scr.append(lvl);

    // Serie + Abzeichen-Zähler
    const flameOn = r.streak > 0;
    scr.append(h('div', { class: 'e-grid-2' },
      h('section', { class: 'e-card e-card--tight' },
        h('div', { class: 'e-streak' },
          h('div', { class: 'e-streak__flame' + (flameOn ? '' : ' is-off'), html: ui.icon('flame') }),
          h('div', { class: 'e-kpi' }, h('span', { class: 'e-kpi__label' }, 'Ziel-Serie'),
            h('span', { class: 'e-kpi__value' }, String(r.streak), h('small', null, r.streak === 1 ? ' Tag' : ' Tage')),
            h('span', { class: 'e-kpi__meta' }, 'Rekord: ' + r.bestStreak)))),
      h('section', { class: 'e-card e-card--tight' },
        h('div', { class: 'e-streak' },
          h('div', { class: 'e-streak__flame', style: { background: 'var(--grad)', boxShadow: 'var(--shadow-glow)' }, html: ui.icon('medal') }),
          h('div', { class: 'e-kpi' }, h('span', { class: 'e-kpi__label' }, 'Abzeichen'),
            h('span', { class: 'e-kpi__value' }, String(r.unlockedCount), h('small', null, ' / ' + r.badges.length)),
            h('span', { class: 'e-kpi__meta' }, r.logStreak > 1 ? r.logStreak + ' Tage dabei' : 'Weiter so!'))))));

    if (!r.xp) {
      scr.append(h('section', { class: 'e-card e-empty' },
        h('div', { html: ui.mascot('wink') }).firstElementChild,
        h('div', { class: 'e-empty__title' }, 'Los geht’s!'),
        h('div', null, 'Trag dein erstes Getränk auf „Heute“ ein – dann gibt’s die ersten XP.')));
    }

    // Abzeichen
    scr.append(h('h2', { class: 'e-section-title' }, 'Abzeichen'));
    const grid = h('div', { class: 'e-badges' });
    r.badges.forEach(b => {
      const pct = Math.round(b.value / b.target * 100);
      const card = h('button', { type: 'button', class: 'e-badge' + (b.unlocked ? '' : ' is-locked'),
        'aria-label': b.name + (b.unlocked ? ', freigeschaltet' : ', gesperrt, ' + b.progressText), onclick: () => { ui.haptic(8); openBadge(b); } },
        medal(b, { locked: !b.unlocked }),
        h('div', { class: 'e-badge__name' }, b.name),
        b.unlocked ? h('div', { class: 'e-badge__meta' }, U.fmtDateShort(b.date))
          : h('div', { class: 'e-stack-sm', style: { alignItems: 'center', gap: '4px', width: '100%' } },
            h('div', { class: 'e-badge__prog' }, h('i', { style: { width: pct + '%' } })),
            h('div', { class: 'e-badge__meta' }, b.progressText)));
      grid.append(card);
    });
    scr.append(grid);

    // Farbthemen
    const info = themeInfo();
    scr.append(h('h2', { class: 'e-section-title' }, 'Farbthemen'));
    const sw = h('div', { class: 'e-swatches' });
    info.forEach(t => sw.append(h('div', { class: 'e-swatch' + (t.unlocked ? '' : ' is-locked') },
      h('span', { class: 'e-swatch__dot e-theme-opt', 'data-t': t.id, style: { minHeight: '0', padding: '0', boxShadow: s.theme === t.id ? '0 0 0 3px #fff, 0 0 0 5px var(--c-primary)' : 'none' },
        html: t.unlocked ? (s.theme === t.id ? ui.icon('check') : '') : ui.icon('lock') }),
      h('span', null, t.name), h('span', { class: 'e-xs' }, t.unlocked ? 'frei' : 'ab Level ' + t.level))));
    scr.append(h('section', { class: 'e-card' }, sw));

    // XP-Regeln (transparent)
    const rules = [
      ['drop', 'Trinken', '1 XP / 20 ml'], ['target', 'Tagesziel geschafft', '+30'], ['toilet', 'Toilette eingetragen', '+5'],
      ['sun', 'Morgen-Check beantwortet', '+10'], ['ball', 'Training ja/nein eingetragen', '+10']
    ];
    scr.append(h('details', { class: 'e-card e-details' },
      h('summary', null, h('span', null, 'So sammelst du XP'), h('span', { html: ui.icon('chevron-right') }).firstElementChild),
      h('div', { class: 'e-details__body e-rules' },
        rules.map(([ic, t, v]) => h('div', { class: 'e-rule' }, h('span', { class: 'e-list__icon', html: ui.icon(ic) }), h('span', null, t), h('b', null, v))),
        h('div', { class: 'e-xs e-muted', style: { marginTop: '4px' } }, 'Trink-XP zählen bis 160 % deines Tagesziels, Toiletten-XP bis 10× am Tag. Die Ziel-Serie zählt Tage hintereinander mit erreichtem Tagesziel – der heutige Tag bleibt offen, bis er vorbei ist.'),
        h('div', { class: 'e-xs e-muted' }, 'Die ersten Level kommen schnell. Meer, Ozean und Wasser-Legende sind die großen Ziele – für die Wasser-Legende brauchst du etwa ein halbes Jahr.'))));

    el.append(scr);
    // Animationen nach dem Einfügen anstoßen
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.querySelectorAll('.e-ring__val').forEach(c => { c.style.strokeDashoffset = c.getAttribute('data-offset'); });
      el.querySelectorAll('.e-progress__bar[data-w]').forEach(b => { b.style.width = b.getAttribute('data-w') + '%'; });
    }));
  }

  /* ---------- Screen ---------- */
  let root = null;
  if (Emly.screens) {
    Emly.screens.register('erfolge', {
      title: 'Erfolge', icon: '🏆', order: 20, nav: true,
      mount(el) { root = el; render(el); },
      unmount() { root = null; },
      refresh() { if (root) render(root); }
    });
  }

  /* ---------- Listener ---------- */
  if (Emly.bus) {
    Emly.bus.on('data:changed', (p) => {
      if (p && p.kind === 'game') return;               // eigene Schreibvorgänge ignorieren
      clearTimeout(checkTimer);
      checkTimer = setTimeout(() => { try { check(); } catch (e) { console.error('[game.check]', e); } }, 250);
    });
    Emly.bus.on('ui:sheet-closed', (p) => { if (pending && (!p || !p.open)) setTimeout(flush, 350); });
    Emly.bus.on('ui:toast-closed', () => { if (pending) setTimeout(flush, 300); });
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pending) setTimeout(flush, 800); });

  Emly.game = { compute, check, flush, levelFor, themeInfo, unlockedThemes, themesForLevel, openBadge, LEVELS, XP, THEMES, BADGES };
})();
