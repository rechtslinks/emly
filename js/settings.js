/* Emly – settings.js (Mira / Dev C)
 * Screen 'mehr' (order 40): Profil, Farbthema, Mengen & Ziele, Tagesgrenze, Schalter, Backup, Löschen, Installieren, Info.
 */
(function () {
  'use strict';
  const Emly = (window.Emly = window.Emly || {});
  const U = Emly.util, h = U.h;
  const ui = () => Emly.ui;
  const S = () => Emly.store;

  const THEME_FALLBACK = [{ id: 'lagune', name: 'Lagune', level: 1, unlocked: true }, { id: 'beere', name: 'Beere', level: 3 }, { id: 'sunset', name: 'Sunset', level: 5 }, { id: 'mint', name: 'Mint', level: 7 }];
  const themeInfo = () => (Emly.game && Emly.game.themeInfo ? Emly.game.themeInfo() : THEME_FALLBACK);
  const settings = () => (S() && S().getSettings ? S().getSettings() : {}) || {};
  const save = (patch) => { try { S().updateSettings(patch); } catch (e) { console.error('[settings]', e); ui().toast('Speichern hat nicht geklappt.', { icon: 'info' }); } };
  const isStandalone = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;

  /* ---------- Bausteine ---------- */
  function row(iconName, title, sub, end, opts) {
    const o = opts || {};
    const tag = o.onClick ? 'button' : (o.label ? 'label' : 'div');
    const el = h(tag, { class: 'e-list__item' + (o.stack ? ' e-list__item--stack' : ''), type: o.onClick ? 'button' : null, onclick: o.onClick || null, for: o.label || null },
      h('span', { class: 'e-list__icon', html: ui().icon(iconName), style: o.iconStyle || null }),
      h('span', { class: 'e-list__body' }, h('span', { class: 'e-list__title', style: o.titleStyle || null }, title), sub ? h('span', { class: 'e-list__sub', style: { display: 'block' } }, sub) : null),
      end ? (typeof end === 'string' ? h('span', { class: 'e-list__end', html: end }) : h('span', { class: 'e-list__end' }, end)) : null);
    return el;
  }
  function toggle(key, id) {
    const s = settings();
    const input = h('input', { type: 'checkbox', role: 'switch', id, checked: s[key] !== false });
    input.addEventListener('change', () => { ui().haptic(10); save({ [key]: input.checked }); if (key === 'sound' && input.checked) ui().sound('plop'); });
    return h('span', { class: 'e-switch' }, input, h('span', { class: 'e-switch__track' }));
  }
  function stepper(value, { step, min, max, label, onChange }) {
    let v = value;
    const out = h('output', { 'aria-live': 'polite' }, v.toLocaleString('de-DE') + ' ml');
    let t = null;
    const set = (nv) => {
      v = U.clamp(nv, min, max); out.textContent = v.toLocaleString('de-DE') + ' ml'; ui().haptic(6);
      clearTimeout(t); t = setTimeout(() => onChange(v), 450);   // nicht bei jedem Tap speichern/neu rendern
    };
    return h('span', { class: 'e-stepper', role: 'group', 'aria-label': label },
      h('button', { type: 'button', 'aria-label': label + ' verringern', html: ui().icon('minus'), onclick: () => set(v - step) }),
      out,
      h('button', { type: 'button', 'aria-label': label + ' erhöhen', html: ui().icon('plus'), onclick: () => set(v + step) }));
  }
  const section = (title, ...children) => [h('h2', { class: 'e-section-title' }, title), ...children];

  /* ---------- Aktionen ---------- */
  function fileName(prefix, ext) { return prefix + '_' + U.calKey(new Date()) + '.' + ext; }

  async function exportBackup() {
    try {
      const obj = await S().exportJSON();
      const json = JSON.stringify(obj, null, 2);
      const name = fileName('Emly-Backup', 'json');
      const blob = new Blob([json], { type: 'application/json' });
      let file = null;
      try { file = new File([blob], name, { type: 'application/json' }); } catch (e) { /* alte Browser */ }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Emly-Backup', text: 'Backup meiner Emly-Daten (' + U.fmtDate(U.calKey(new Date())) + ')' }); ui().toast('Backup geteilt.'); return; }
        catch (e) { if (e && e.name === 'AbortError') return; /* sonst: Download-Fallback */ }
      }
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: name, style: { display: 'none' } });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      ui().toast('Backup gespeichert: ' + name, { icon: 'download' });
    } catch (e) {
      console.error('[backup export]', e);
      ui().toast('Backup ging gerade nicht. Bitte nochmal versuchen.', { icon: 'info' });
    }
  }

  function importBackup() {
    const input = h('input', { type: 'file', accept: '.json,application/json', style: { display: 'none' } });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0]; input.remove();
      if (!f) return;
      let obj;
      try { obj = JSON.parse(await f.text()); } catch (e) { ui().toast('Diese Datei ist kein Emly-Backup.', { icon: 'info' }); return; }
      if (!obj || typeof obj !== 'object' || (!Array.isArray(obj.entries) && !obj.settings && !obj.days)) { ui().toast('Diese Datei ist kein Emly-Backup.', { icon: 'info' }); return; }
      const n = Array.isArray(obj.entries) ? obj.entries.length : 0, days = Object.keys(obj.days || {}).length;
      const when = obj.exportedAt ? ' vom ' + U.fmtDate(U.calKey(new Date(obj.exportedAt))) : '';
      const ok = await ui().confirm('Backup importieren?', `Backup${when}: ${n} Einträge, ${days} Tage mit Angaben. Deine aktuellen Daten auf diesem Handy werden dabei ersetzt. Fotos sind im Backup nicht enthalten.`, 'Importieren');
      if (!ok) return;
      try {
        const res = await S().importJSON(obj);
        if (Emly.game && Emly.game.check) Emly.game.check({ silent: true });   // keine Konfetti-Flut nach Import
        const cnt = res && typeof res.entries === 'number' ? res.entries : n;
        ui().toast('Backup importiert – ' + cnt + ' Einträge.', { icon: 'check' });
      } catch (e) {
        console.warn('[backup import]', e);
        ui().toast((e && e.message) || 'Import hat nicht geklappt.', { icon: 'info', duration: 5000 });
      }
    });
    document.body.append(input);
    input.click();
  }

  async function resetAll() {
    const ok1 = await ui().confirm('Alle Daten löschen?', 'Alle Einträge, Fotos, Abzeichen und Einstellungen auf diesem Handy werden gelöscht. Tipp: Vorher ein Backup exportieren.', 'Weiter', { danger: true });
    if (!ok1) return;
    const ok2 = await ui().confirm('Wirklich endgültig?', 'Das kann man nicht rückgängig machen.', 'Ja, alles löschen', { danger: true });
    if (!ok2) return;
    try {
      await S().resetAll();
      try { localStorage.removeItem('emly.installHintSeen'); } catch (e) { /* egal */ }
      location.hash = '#heute';
      location.reload();
    } catch (e) { console.error('[reset]', e); ui().toast('Löschen hat nicht geklappt.', { icon: 'info' }); }
  }

  function installHelp() {
    const app = Emly.app || {};
    if (isStandalone()) { ui().toast('Emly ist schon als App installiert.', { icon: 'check' }); return; }
    if (app.canInstall && app.canInstall()) { app.promptInstall(); return; }
    const body = h('div', { class: 'e-stack' },
      h('p', null, 'So kommt Emly als App-Symbol auf deinen Startbildschirm:'),
      h('div', { class: 'e-list' },
        row('dots', '1. Menü öffnen', 'In Chrome oben rechts auf ⋮ tippen (Samsung Internet: unten ☰).'),
        row('install', '2. „Zum Startbildschirm“', 'Oder „App installieren“ / „Seite hinzufügen zu → Startbildschirm“.'),
        row('check', '3. Fertig!', 'Emly startet jetzt wie eine echte App – auch ohne Internet.')));
    ui().sheet({ title: 'App installieren', body, actions: [{ label: 'Alles klar', primary: true }] });
  }

  function pickTheme(t) {
    ui().haptic(10);
    if (!t.unlocked) { ui().toast(t.name + ' schaltest du ab Level ' + t.level + ' frei.', { icon: 'lock' }); return; }
    if (settings().theme === t.id) return;
    save({ theme: t.id });
    ui().sound('plop');
  }

  /* ---------- Render ---------- */
  function render(el) {
    const s = settings();
    const u = s.units || { half: 100, glass: 200, bottle: 500 };
    el.innerHTML = '';
    const scr = h('div', { class: 'e-screen' });

    scr.append(h('header', { class: 'e-header' },
      h('div', { class: 'e-header__text' }, h('h1', { class: 'e-h1' }, 'Mehr'), h('div', { class: 'e-sub' }, 'Einstellungen, Backup & Infos')),
      h('span', { class: 'e-ico-bubble e-ico-bubble--grad', html: ui().icon('gear') })));

    // Profil
    const nameInput = h('input', { class: 'e-input', id: 'set-name', type: 'text', value: s.name || '', maxlength: '24', autocomplete: 'off', enterkeyhint: 'done', placeholder: 'Dein Name' });
    const saveName = () => { const v = nameInput.value.trim(); if (v && v !== settings().name) { save({ name: v }); ui().toast('Hallo ' + v + '!', { icon: 'user' }); } else if (!v) nameInput.value = settings().name || ''; };
    nameInput.addEventListener('change', saveName);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') nameInput.blur(); });
    scr.append(h('section', { class: 'e-card' },
      h('div', { class: 'e-hero-mini' }, h('div', { html: ui().mascot('happy') }).firstElementChild,
        h('div', { class: 'e-grow' }, h('label', { class: 'e-label', for: 'set-name' }, 'Wie heißt du?'), nameInput))));

    // Farbthema
    const grid = h('div', { class: 'e-theme-grid', role: 'radiogroup', 'aria-label': 'Farbthema' });
    themeInfo().forEach(t => grid.append(h('button', {
      type: 'button', role: 'radio', 'aria-checked': String(s.theme === t.id), 'data-t': t.id,
      class: 'e-theme-opt' + (s.theme === t.id ? ' is-active' : '') + (t.unlocked ? '' : ' is-locked'), onclick: () => pickTheme(t),
      'aria-label': t.name + (t.unlocked ? '' : ', gesperrt bis Level ' + t.level)
    }, h('span', { class: 'e-theme-opt__bubble' }),
      t.unlocked ? h('span', { class: 'e-theme-opt__check', html: ui().icon('check', { stroke: 3 }) }) : h('span', { class: 'e-theme-opt__lock', html: ui().icon('lock') }),
      h('span', { class: 'e-theme-opt__name' }, t.name),
      h('span', { class: 'e-theme-opt__meta' }, t.unlocked ? (s.theme === t.id ? 'aktiv' : 'freigeschaltet') : 'ab Level ' + t.level))));
    scr.append(...section('Farbthema', h('section', { class: 'e-card' }, grid)));

    // Mengen
    const unit = (key) => (v) => save({ units: Object.assign({}, settings().units || u, { [key]: v }) });
    scr.append(...section('Trinkmengen',
      h('div', { class: 'e-list' },
        row('glass-half', '½ Glas', null, stepper(u.half, { step: 10, min: 30, max: 300, label: 'Halbes Glas', onChange: unit('half') })),
        row('glass', 'Glas', null, stepper(u.glass, { step: 10, min: 100, max: 500, label: 'Glas', onChange: unit('glass') })),
        row('bottle', 'Flasche', null, stepper(u.bottle, { step: 50, min: 250, max: 1500, label: 'Trinkflasche', onChange: unit('bottle') })))));

    // Ziele
    scr.append(...section('Tagesziele',
      h('div', { class: 'e-list' },
        row('backpack', 'Schultag', 'ohne Training', stepper(s.goalBase || 1200, { step: 50, min: 600, max: 3000, label: 'Ziel normaler Tag', onChange: v => save({ goalBase: v }) })),
        row('ball', 'Training', 'Tage mit Fußball', stepper(s.goalTraining || 1700, { step: 50, min: 800, max: 3500, label: 'Ziel Trainingstag', onChange: v => save({ goalTraining: v }) }))),
      h('div', { class: 'e-xs e-muted', style: { padding: '0 6px' } }, 'Richtwert DGE für 10–13 Jahre: ca. 1.170 ml Getränke pro Tag. An Trainingstagen braucht der Körper mehr.')));

    // Tagesgrenze
    const seg = h('div', { class: 'e-seg', role: 'tablist', 'aria-label': 'Tagesgrenze' });
    [2, 3, 4, 5, 6].forEach(hr => seg.append(h('button', {
      type: 'button', role: 'tab', 'aria-selected': String((s.dayStartHour == null ? 4 : s.dayStartHour) === hr),
      class: (s.dayStartHour == null ? 4 : s.dayStartHour) === hr ? 'is-active' : '', onclick: () => { ui().haptic(8); save({ dayStartHour: hr }); }
    }, hr + ' Uhr')));
    scr.append(...section('Neuer Tag beginnt um',
      h('section', { class: 'e-card e-stack-sm' }, seg,
        h('div', { class: 'e-xs e-muted' }, 'Was du davor einträgst (z. B. um 1 Uhr nachts), zählt noch zum Vortag.'))));

    // Schalter
    scr.append(...section('App',
      h('div', { class: 'e-list' },
        row('camera', 'Fotos speichern', 'Fotos bleiben nur auf diesem Handy', toggle('savePhotos', 'sw-photos'), { label: 'sw-photos' }),
        row('volume', 'Töne', 'Kurzes „Plopp“ beim Eintragen', toggle('sound', 'sw-sound'), { label: 'sw-sound' }),
        row('vibrate', 'Vibration', 'Kleines Feedback beim Tippen', toggle('haptics', 'sw-haptics'), { label: 'sw-haptics' }))));

    // Daten
    scr.append(...section('Deine Daten',
      h('div', { class: 'e-list' },
        row('share', 'Backup exportieren', 'Als Datei teilen oder speichern (ohne Fotos)', ui().icon('chevron-right'), { onClick: exportBackup }),
        row('upload', 'Backup importieren', 'Aus einer Emly-Backup-Datei', ui().icon('chevron-right'), { onClick: importBackup }),
        row('trash', 'Alle Daten löschen', 'Mit doppelter Sicherheitsabfrage', ui().icon('chevron-right'), { onClick: resetAll, iconStyle: { background: '#FCE9EC', color: '#A8283E' }, titleStyle: { color: '#A8283E' } }))));

    // Installieren
    const standalone = isStandalone();
    const canInstall = Emly.app && Emly.app.canInstall && Emly.app.canInstall();
    scr.append(...section('App installieren',
      h('div', { class: 'e-list' },
        row('install', standalone ? 'Emly ist installiert' : (canInstall ? 'Zum Startbildschirm hinzufügen' : 'So installierst du Emly'),
          standalone ? 'Läuft als App – auch offline.' : (canInstall ? 'Ein Tipp – dann ist Emly wie eine echte App.' : 'Menü ⋮ → „Zum Startbildschirm“'),
          standalone ? ui().icon('check') : ui().icon('chevron-right'), standalone ? {} : { onClick: installHelp }))));

    // Info
    scr.append(...section('Info',
      h('section', { class: 'e-card e-stack-sm' },
        h('div', { class: 'e-row' }, h('span', { class: 'e-list__icon', html: ui().icon('shield') }),
          h('div', { class: 'e-info-text' }, h('b', null, 'Deine Daten bleiben nur auf diesem Handy.'), ' Keine Cloud, kein Konto, kein Tracking. Berichte verschickst nur du selbst.')),
        h('hr', { class: 'e-divider' }),
        h('div', { class: 'e-row' }, h('span', { class: 'e-list__icon', html: ui().icon('info') }),
          h('div', { class: 'e-info-text' }, h('b', null, 'Richtwert: '), 'DGE (Deutsche Gesellschaft für Ernährung) für 10–13 Jahre: ca. 1.170 ml Getränke pro Tag. Die App-Ziele (1.200 ml, Training 1.700 ml) sind Annahmen und hier änderbar. Emly ersetzt keine ärztliche Beratung.')),
        h('hr', { class: 'e-divider' }),
        h('div', { class: 'e-row e-row--between e-xs e-muted' }, h('span', null, 'Emly · Version ' + (Emly.VERSION || '1.0.0')), h('span', null, 'Gemacht mit ', h('span', { html: ui().icon('heart', { cls: 'e-ico--sm' }), style: { display: 'inline-block', verticalAlign: 'middle', color: 'var(--c-primary)' } }), ' für dich')))));

    el.append(scr);
  }

  let root = null;
  if (Emly.screens) {
    Emly.screens.register('mehr', {
      title: 'Mehr', icon: '⚙️', order: 40, nav: true,
      mount(el) { root = el; render(el); },
      unmount() { root = null; },
      refresh() {
        if (!root) return;
        const a = document.activeElement;
        if (a && root.contains(a) && a.tagName === 'INPUT' && a.type === 'text') return;  // Tippen nicht unterbrechen
        const y = window.scrollY; render(root); window.scrollTo(0, y);
      }
    });
  }
  if (Emly.bus) Emly.bus.on('app:installable', () => { if (root) { const y = window.scrollY; render(root); window.scrollTo(0, y); } });
})();
