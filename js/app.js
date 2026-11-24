/* Emly – app.js (Mira / Dev C)
 * Ablauf: store.init → Theme → Onboarding → Bottom-Nav → Hash-Routing → Morgen-Check → Service Worker.
 * Robust: fehlt ein Modul oder wirft es, bleiben Navigation + freundliche Fehlerkarte (nie weiße Seite).
 */
(function () {
  'use strict';
  const Emly = (window.Emly = window.Emly || {});
  const U = Emly.util, h = U && U.h;

  const THEME_COLORS = { lagune: '#0AA5C4', beere: '#9B4DF0', sunset: '#FF7A45', mint: '#12B886' };
  const NAV_ICONS = { heute: 'drop', erfolge: 'trophy', berichte: 'chart', mehr: 'gear' };
  const $ = (sel) => document.querySelector(sel);
  const hasUI = () => !!(Emly.ui && Emly.ui.icon);
  const icon = (n) => (hasUI() ? Emly.ui.icon(n) : '');
  const storeOk = () => !!(Emly.store && Emly.store.getSettings);

  let active = null;          // { id, def, el }
  let deferredPrompt = null;
  let booted = false;
  let lastDayKey = null;
  const problems = [];        // Lade-/Init-Probleme für die Fehlerkarte

  /* ---------- Theme ---------- */
  function applyTheme(theme) {
    const t = THEME_COLORS[theme] ? theme : 'lagune';
    document.documentElement.setAttribute('data-theme', t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[t]);
    try { localStorage.setItem('emly.theme', t); } catch (e) { /* egal */ }
  }
  const currentSettings = () => { try { return storeOk() ? Emly.store.getSettings() || {} : {}; } catch (e) { return {}; } };

  /* ---------- Fehlerkarte ---------- */
  function errorCard(title, detail, err) {
    if (err) console.error('[app]', title, err);
    const card = document.createElement('section');
    card.className = 'e-card e-empty e-error';
    card.innerHTML = (hasUI() ? Emly.ui.mascot('wow') : '') +
      '<div class="e-empty__title"></div><div class="e-small"></div>' +
      '<button type="button" class="e-btn e-btn--soft" style="margin-top:8px">' + icon('undo') + '<span>Neu laden</span></button>';
    card.querySelector('.e-empty__title').textContent = title;
    card.querySelector('.e-small').textContent = detail;
    card.querySelector('button').addEventListener('click', () => location.reload());
    return card;
  }

  /* ---------- Navigation ---------- */
  function navScreens() {
    try { return Emly.screens ? Emly.screens.all().filter(s => s.nav !== false) : []; } catch (e) { return []; }
  }
  function renderNav() {
    const nav = $('#nav'); if (!nav) return;
    const list = navScreens();
    const inner = document.createElement('div'); inner.className = 'e-nav__inner';
    list.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'e-nav__btn'; b.dataset.id = s.id;
      b.setAttribute('aria-label', s.title || s.id);
      const ic = NAV_ICONS[s.id] && hasUI() ? icon(NAV_ICONS[s.id]) : `<span class="e-nav__emoji" aria-hidden="true">${U.esc(s.icon || '•')}</span>`;
      b.innerHTML = ic + `<span>${U.esc(s.title || s.id)}</span>`;
      b.addEventListener('click', () => {
        if (hasUI()) Emly.ui.haptic(8);
        if (active && active.id === s.id) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
        location.hash = '#' + s.id;
      });
      inner.appendChild(b);
    });
    nav.innerHTML = ''; nav.appendChild(inner);
    nav.hidden = !list.length;
    markNav();
  }
  function markNav() {
    document.querySelectorAll('.e-nav__btn').forEach(b => {
      const on = active && b.dataset.id === active.id;
      b.classList.toggle('is-active', !!on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ---------- Routing ---------- */
  function defaultId() { const l = navScreens(); return l.length ? l[0].id : null; }
  function route() {
    const want = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
    const def = want && Emly.screens && Emly.screens.get(want);
    const id = def ? want : defaultId();
    show(id);
  }
  function show(id) {
    const main = $('#screen'); if (!main) return;
    if (hasUI() && Emly.ui.isSheetOpen && Emly.ui.isSheetOpen()) Emly.ui.closeAllSheets();
    if (active) {
      if (active.id === id) return;
      try { active.def.unmount && active.def.unmount(); } catch (e) { console.error('[app] unmount', active.id, e); }
    }
    main.innerHTML = '';
    if (!id) {
      active = null;
      main.appendChild(errorCard('Hier fehlt noch etwas', 'Die App-Teile konnten nicht geladen werden. Bitte lade die Seite neu.'));
      markNav(); return;
    }
    const def = Emly.screens.get(id);
    const el = document.createElement('div');
    el.className = 'e-screen-host'; el.dataset.screen = id;
    main.appendChild(el);
    active = { id, def, el };
    document.title = (def.title ? def.title + ' · ' : '') + 'Emly';
    try { def.mount(el); }
    catch (e) {
      el.innerHTML = '';
      el.appendChild(errorCard('Ups, hier hakt etwas', '„' + (def.title || id) + '“ konnte gerade nicht angezeigt werden. Deine Daten sind sicher.', e));
    }
    window.scrollTo(0, 0);
    markNav();
    if (location.hash !== '#' + id) history.replaceState(history.state, '', '#' + id);
  }
  let refreshQueued = false;
  function refreshActive() {
    if (refreshQueued) return; refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      if (!active || !active.def.refresh) return;
      try { active.def.refresh(); } catch (e) { console.error('[app] refresh', active.id, e); }
    });
  }

  /* ---------- Onboarding (3 Slides) ---------- */
  function onboarding() {
    return new Promise((resolve) => {
      const s = currentSettings();
      const name = s.name || 'Emily';
      let theme = s.theme || 'lagune';
      const ui = Emly.ui;
      const wrap = document.createElement('div');
      wrap.className = 'e-onb'; wrap.setAttribute('role', 'dialog'); wrap.setAttribute('aria-modal', 'true'); wrap.setAttribute('aria-label', 'Willkommen bei Emly');
      const bubbles = Array.from({ length: 9 }, (_, i) => `<i style="left:${(i * 11 + 4) % 96}%;width:${10 + (i * 7) % 26}px;height:${10 + (i * 7) % 26}px;animation-duration:${9 + (i * 3) % 9}s;animation-delay:-${(i * 2.3).toFixed(1)}s"></i>`).join('');
      const themes = [['lagune', 'Lagune', 'Aqua & Blau'], ['beere', 'Beere', 'Lila & Pink'], ['sunset', 'Sunset', 'Koralle & Orange'], ['mint', 'Mint', 'Grün & Türkis']];
      wrap.innerHTML = `
        <div class="e-onb__bubbles" aria-hidden="true">${bubbles}</div>
        <div class="e-onb__top"><button type="button" class="e-btn e-btn--glass e-btn--sm" data-skip>Überspringen</button></div>
        <div class="e-onb__track">
          <section class="e-onb__slide" aria-label="1 von 3">
            ${ui.mascot('happy', { white: true, float: true })}
            <h1 class="e-onb__title">Hey ${U.esc(name)}!</h1>
            <p class="e-onb__text">Das ist <b>Emly</b> – dein Trink-Tagebuch. Schnell eintragen, XP sammeln, Abzeichen holen.</p>
          </section>
          <section class="e-onb__slide" aria-label="2 von 3">
            <h1 class="e-onb__title">So geht’s</h1>
            <div class="e-onb__how">
              <div class="e-onb__how-item"><span class="e-ico-bubble">${ui.icon('glass')}</span><div><b>Ein Tipp = eingetragen</b><span>Glas, Flasche oder Toilette – fertig.</span></div></div>
              <div class="e-onb__how-item"><span class="e-ico-bubble">${ui.icon('sun')}</span><div><b>Morgens kurz die Nacht</b><span>Zwei schnelle Fragen, ganz ohne Stress.</span></div></div>
              <div class="e-onb__how-item"><span class="e-ico-bubble">${ui.icon('trophy')}</span><div><b>XP &amp; Abzeichen</b><span>Fürs Trinken und Dranbleiben.</span></div></div>
              <div class="e-onb__how-item"><span class="e-ico-bubble">${ui.icon('shield')}</span><div><b>Bleibt auf deinem Handy</b><span>Keine Cloud, kein Konto.</span></div></div>
            </div>
          </section>
          <section class="e-onb__slide" aria-label="3 von 3">
            <h1 class="e-onb__title">Deine Farbe</h1>
            <p class="e-onb__text">Such dir dein Start-Thema aus. Die anderen schaltest du mit Levels frei.</p>
            <div class="e-onb__themes" role="radiogroup" aria-label="Farbthema">
              ${themes.map(([id, n, d]) => `<button type="button" role="radio" class="e-theme-opt" data-t="${id}" aria-checked="false"><span class="e-theme-opt__bubble"></span><span class="e-theme-opt__check">${ui.icon('check', { stroke: 3 })}</span><span class="e-theme-opt__name">${n}</span><span class="e-theme-opt__meta">${d}</span></button>`).join('')}
            </div>
          </section>
        </div>
        <div class="e-onb__foot">
          <div class="e-onb__dots" aria-hidden="true"><i></i><i></i><i></i></div>
          <button type="button" class="e-btn e-btn--white e-btn--lg" data-next>Weiter</button>
        </div>`;
      document.body.appendChild(wrap);
      const track = wrap.querySelector('.e-onb__track');
      const next = wrap.querySelector('[data-next]');
      const dots = wrap.querySelectorAll('.e-onb__dots i');
      let idx = 0;
      const setIdx = (i) => {
        idx = i;
        dots.forEach((d, j) => d.classList.toggle('is-active', j === i));
        next.textContent = i === 2 ? 'Los geht’s!' : 'Weiter';
        wrap.querySelector('[data-skip]').style.visibility = i === 2 ? 'hidden' : 'visible';
      };
      const go = (i) => { track.scrollTo({ left: i * track.clientWidth, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); setIdx(i); };
      track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== idx) setIdx(i); }, { passive: true });
      const pick = (t) => {
        theme = t; applyTheme(t);
        wrap.querySelectorAll('.e-theme-opt').forEach(b => { const on = b.dataset.t === t; b.classList.toggle('is-active', on); b.setAttribute('aria-checked', String(on)); });
      };
      wrap.querySelectorAll('.e-theme-opt').forEach(b => b.addEventListener('click', () => { ui.haptic(10); ui.sound('plop'); pick(b.dataset.t); }));
      pick(theme);
      const finish = () => {
        try {
          if (storeOk()) {
            Emly.store.updateSettings({ onboarded: true, theme });
            if (Emly.store.getGame && Emly.store.setGame) {
              const g = Emly.store.getGame() || {};
              Emly.store.setGame({ unlockedThemes: Array.from(new Set(['lagune', theme].concat(g.unlockedThemes || []))) });
            }
          }
        } catch (e) { console.error('[onboarding]', e); }
        wrap.classList.add('is-leaving');
        setTimeout(() => { wrap.remove(); resolve(); }, 380);
      };
      next.addEventListener('click', () => { ui.haptic(10); if (idx < 2) go(idx + 1); else finish(); });
      wrap.querySelector('[data-skip]').addEventListener('click', () => go(2));
      setIdx(0);
    });
  }

  /* ---------- Morgen-Check ---------- */
  function morning() {
    if (document.querySelector('.e-onb')) return;
    try { if (Emly.today && Emly.today.checkMorning) Emly.today.checkMorning(); }
    catch (e) { console.error('[app] checkMorning', e); }
  }

  /* ---------- PWA ---------- */
  function registerSW() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('./sw.js', { scope: './' }).then(reg => {
      if (!reg) return;
      Emly.app.swRegistration = reg;
      const offerUpdate = (w) => {
        if (!w || !navigator.serviceWorker.controller || !hasUI()) return;
        Emly.ui.toast('Neue Version von Emly ist da.', { duration: 0, icon: 'sparkle', actions: [{ label: 'Aktualisieren', onClick: () => { Emly.app.updateRequested = true; w.postMessage({ type: 'SKIP_WAITING' }); } }] });
      };
      if (reg.waiting) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener('statechange', () => { if (w.state === 'installed') offerUpdate(w); });
      });
    }).catch(e => console.warn('[app] SW-Registrierung fehlgeschlagen', e));
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (reloading || !Emly.app.updateRequested) return; reloading = true; location.reload(); });
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    if (Emly.bus) Emly.bus.emit('app:installable', true);
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    if (hasUI()) Emly.ui.toast('Emly ist jetzt auf deinem Startbildschirm!', { icon: 'check' });
    if (Emly.bus) Emly.bus.emit('app:installable', false);
  });

  /* ---------- Öffentliche App-API ---------- */
  Emly.app = {
    applyTheme,
    navigate(id) { location.hash = '#' + id; },
    current() { return active ? active.id : null; },
    refresh: refreshActive,
    canInstall() { return !!deferredPrompt; },
    async promptInstall() {
      if (!deferredPrompt) return false;
      const p = deferredPrompt; deferredPrompt = null;
      try { p.prompt(); const r = await p.userChoice; if (Emly.bus) Emly.bus.emit('app:installable', false); return r && r.outcome === 'accepted'; }
      catch (e) { console.warn(e); return false; }
    },
    isStandalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true; },
    problems,
    updateRequested: false
  };

  /* ---------- Speicherprobleme (store:error) ---------- */
  // Freundlich, nie technisch. Ein Hinweis pro Art und höchstens alle 30 s (save kann mehrfach feuern).
  const STORE_MSG = {
    save: 'Speichern hat gerade nicht geklappt. Ist der Handy-Speicher fast voll? Dann ein bisschen Platz schaffen.',
    corrupt: 'Deine alten Daten waren nicht lesbar – Emly hat sie sicher beiseitegelegt und neu gestartet. Lass dir helfen, ein Backup einzuspielen.',
    nostorage: 'Dieser Browser speichert gerade nichts (privater Modus?). Öffne Emly normal oder über das App-Symbol, sonst gehen Einträge beim Schließen verloren.'
  };
  const storeErrShown = {};
  let pendingStoreErr = null;
  function showStoreError(p) {
    const kind = (p && p.kind) || 'save';
    const now = Date.now();
    if (storeErrShown[kind] && now - storeErrShown[kind] < 30000) return;
    if (!hasUI() || document.querySelector('.e-onb')) { pendingStoreErr = p || { kind }; return; }
    storeErrShown[kind] = now;
    Emly.ui.toast(STORE_MSG[kind] || STORE_MSG.save, { icon: 'info', duration: kind === 'save' ? 6000 : 9000 });
  }
  if (Emly.bus) Emly.bus.on('store:error', showStoreError);

  /* ---------- Start ---------- */
  async function boot() {
    if (booted) return; booted = true;
    // Theme sofort aus Cache (kein Farbblitz), später aus Store
    try { applyTheme(localStorage.getItem('emly.theme') || 'lagune'); } catch (e) { applyTheme('lagune'); }

    if (!U || !Emly.screens) { document.getElementById('screen').innerHTML = '<p style="padding:24px">Emly konnte nicht starten. Bitte neu laden.</p>'; return; }
    if (!hasUI()) problems.push('ui');

    // 1) Store
    let storeReady = false;
    if (storeOk() && Emly.store.init) {
      try { await Emly.store.init(); storeReady = true; }
      catch (e) { problems.push('store-init'); console.error('[app] store.init', e); }
    } else problems.push('store');

    // 2) Theme aus Einstellungen
    applyTheme(currentSettings().theme);
    lastDayKey = storeReady && Emly.store.todayKey ? Emly.store.todayKey() : null;

    // 3) Navigation + Screen
    renderNav();
    window.addEventListener('hashchange', route);
    route();
    if (!storeReady && $('#screen')) {
      $('#screen').prepend(errorCard('Speicher nicht erreichbar', 'Deine Einträge konnten gerade nicht geladen werden. Tipp: Seite neu laden. Im privaten Modus speichert der Browser nichts.'));
    }

    // 4) Events
    if (Emly.bus) {
      Emly.bus.on('data:changed', (p) => {
        if (p && p.kind === 'settings') applyTheme(currentSettings().theme);
        refreshActive();
      });
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      morning();
      const k = storeReady && Emly.store.todayKey ? Emly.store.todayKey() : null;
      if (k && k !== lastDayKey) { lastDayKey = k; refreshActive(); }   // über Mitternacht/Tagesgrenze offen gelassen
    });

    // 5) PWA früh registrieren (Review Jonas): sonst ist die App erst nach dem Onboarding offline-fähig
    registerSW();

    // 6) Onboarding
    if (storeReady && hasUI() && !currentSettings().onboarded) await onboarding();

    // 6) Morgen-Check, Spiel-Abgleich
    if (pendingStoreErr) { const p = pendingStoreErr; pendingStoreErr = null; showStoreError(p); }
    morning();
    try { if (storeReady && Emly.game && Emly.game.check) Emly.game.check(); } catch (e) { console.error('[app] game.check', e); }

  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
