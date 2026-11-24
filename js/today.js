/* Emly – today.js (Dev A „Erfassung“, Lena)
 * Screen 'heute': Füllstand, Trink-Kacheln, Foto, Training, Toilette, Morgen-Check, Tagesliste, „Gestern“ nachtragen.
 * Export: Emly.today = { checkMorning(), openTimeSheet(entryId) }
 * Nutzt Emly.ui (toast, sheet, haptic, sound, icon, confetti) laut Vertrag – mit kleinen Fallbacks,
 * damit der Screen auch funktioniert, falls ui.js fehlt oder wirft.
 */
(function () {
  'use strict';
  const E = (window.Emly = window.Emly || {});
  const U = E.util;
  const h = U.h;
  const S = () => E.store;

  /* ================= Konstanten ================= */
  const UNITS = [
    { id: 'half', label: '½ Glas', icon: 'glass-half', emo: '🥛' },
    { id: 'glass', label: 'Glas', icon: 'glass', emo: '🥤' },
    { id: 'bottle', label: 'Flasche', icon: 'bottle', emo: '🍼' }
  ];
  const UNIT_LABEL = { half: '½ Glas', glass: 'Glas', bottle: 'Flasche', custom: 'Getränk' };
  const DRINKS = [
    { id: 'wasser', label: 'Wasser', emo: '💧' },
    { id: 'schorle', label: 'Schorle', emo: '🫧' },
    { id: 'tee', label: 'Tee', emo: '🍵' },
    { id: 'milch', label: 'Milch', emo: '🥛' },
    { id: 'saft', label: 'Saft', emo: '🧃' },
    { id: 'sonstiges', label: 'Sonstiges', emo: '🥤' }
  ];
  const DRINK = Object.fromEntries(DRINKS.map(d => [d.id, d]));
  const REL_CHIPS = [
    { id: 'r0', label: 'gerade eben', min: 0 },
    { id: 'r30', label: 'vor ½ Std', min: 30 },
    { id: 'r60', label: 'vor 1 Std', min: 60 },
    { id: 'r120', label: 'vor 2 Std', min: 120 }
  ];
  const PART_CHIPS = [
    { id: 'd7', label: 'Morgens', h: 7 },
    { id: 'd10', label: 'Vormittag', h: 10 },
    { id: 'd13', label: 'Mittag', h: 13 },
    { id: 'd16', label: 'Nachmittag', h: 16 },
    { id: 'd19', label: 'Abend', h: 19 },
    { id: 'd21', label: 'Spät', h: 21 }
  ];
  const FILL_TOP = 30, FILL_BOTTOM = 196; // SVG-Koordinaten des Füllbereichs
  const MORNING_KEY = 'emly.today.morningDismissed';
  const reduceMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { return false; } };
  const fmtNum = n => Math.round(n).toLocaleString('de-DE');

  /* ================= UI-Adapter (Vertrag Emly.ui + Fallbacks) ================= */
  const fb = {
    toast(msg, opts) {
      const o = opts || {};
      document.querySelectorAll('.t-fb-toast').forEach(n => n.remove());
      const el = h('div', { class: 't-fb-toast', role: 'status' }, h('span', null, msg));
      (o.actions || []).forEach(a => el.append(h('button', { type: 'button', onclick: () => { el.remove(); a.onClick && a.onClick(); } }, a.label)));
      document.body.append(el);
      setTimeout(() => el.remove(), o.duration || 3500);
    },
    sheet(o) {
      const back = h('div', { class: 't-fb-back' });
      const panel = h('div', { class: 't-fb-sheet', role: 'dialog', 'aria-modal': 'true' });
      if (o.title) panel.append(h('h2', { class: 't-fb-title' }, o.title));
      if (o.body) { if (typeof o.body === 'string') panel.append(h('div', { html: o.body })); else panel.append(o.body); }
      let open = true;
      const close = () => { if (!open) return; open = false; back.remove(); panel.remove(); o.onClose && o.onClose(); };
      (o.actions || []).forEach(a => panel.append(h('button', { type: 'button', class: 't-btn' + (a.primary ? ' t-btn-primary' : ''), onclick: () => { a.onClick && a.onClick(); close(); } }, a.label)));
      back.addEventListener('click', close);
      document.body.append(back, panel);
      return { close };
    }
  };
  function uiCall(name, args, fallback) {
    try {
      if (E.ui && typeof E.ui[name] === 'function') return E.ui[name].apply(E.ui, args);
    } catch (e) { console.error('[today] Emly.ui.' + name, e); }
    return fallback ? fallback.apply(null, args) : undefined;
  }
  const ui = {
    toast: (msg, opts) => uiCall('toast', [msg, opts], fb.toast),
    haptic: p => uiCall('haptic', p == null ? [] : [p]),
    sound: n => uiCall('sound', [n]),
    confetti: () => uiCall('confetti', []),
    icon(name, emo) {
      let svg = '';
      try { if (E.ui && E.ui.icon) svg = E.ui.icon(name) || ''; } catch (_) { svg = ''; }
      return svg && String(svg).indexOf('<svg') >= 0 ? svg : '<span class="t-emo" aria-hidden="true">' + emo + '</span>';
    }
  };
  /** Bottom-Sheet; onClose feuert genau einmal, egal wie geschlossen wird. */
  function openSheet(title, body, onClose) {
    let closed = false, handle = null;
    const done = () => { if (closed) return; closed = true; try { onClose && onClose(); } catch (e) { console.error(e); } };
    body.classList.add('t-sheet');
    const opts = { title, body, actions: [], onClose: done };
    try { handle = E.ui && E.ui.sheet ? E.ui.sheet(opts) : null; } catch (e) { console.error('[today] Emly.ui.sheet', e); handle = null; }
    if (!handle) handle = fb.sheet(opts);
    return {
      get closed() { return closed; },
      close() {
        if (closed) return;
        try { handle && handle.close && handle.close(); } catch (e) { console.error(e); }
        done();
      }
    };
  }

  /* ================= Styles ================= */
  function injectStyles() {
    if (document.getElementById('today-styles')) return;
    const css = `
.t-root,.t-sheet,.t-fb-toast,.t-fb-sheet{--t-p:var(--c-primary,#0ea5e9);--t-p2:var(--c-primary-2,#14b8a6);--t-acc:var(--c-accent,#f59e0b);
 --t-bg:var(--c-bg,#f0f7fb);--t-card:var(--c-card,#fff);--t-text:var(--c-text,#12304a);--t-muted:var(--c-muted,#5f7488);
 --t-r:var(--radius,20px);--t-sh:var(--shadow,0 6px 20px rgba(18,48,74,.09));--t-soft:color-mix(in srgb,var(--t-p) 12%,var(--t-card));
 --t-line:color-mix(in srgb,var(--t-text) 10%,transparent);--t-calm:#5b7d9c;
 --t-ink:var(--c-primary-ink,color-mix(in srgb,var(--t-p) 65%,#000));--t-gs:var(--grad-strong,linear-gradient(135deg,var(--t-p),var(--t-p2)));}
.t-root{box-sizing:border-box;width:100%;max-width:560px;margin:0 auto;padding:4px 0 8px;color:var(--t-text);overflow-x:hidden;-webkit-tap-highlight-color:transparent}
.t-root *,.t-sheet *{box-sizing:border-box}
.t-root button,.t-sheet button{font:inherit;color:inherit;-webkit-tap-highlight-color:transparent;touch-action:manipulation}
.t-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}
.t-hello h1{margin:0;font-size:28px;line-height:1.15;font-weight:800;letter-spacing:-.025em}
.t-date{margin:3px 0 0;color:var(--t-muted);font-size:14px;font-weight:600}
.t-switch{flex:none;min-height:48px;padding:0 14px;border:0;border-radius:999px;background:var(--t-soft);color:var(--t-ink)!important;font-weight:700!important;font-size:14px!important;cursor:pointer}
.t-switch:active{transform:scale(.96)}
.t-banner{display:none;align-items:center;gap:8px;margin:-2px 0 12px;padding:10px 14px;border-radius:14px;background:color-mix(in srgb,var(--t-acc) 16%,var(--t-card));font-size:14px;font-weight:600}
.t-root.t-past .t-banner{display:flex}
.t-gauge-card{display:grid;grid-template-columns:112px 1fr;gap:14px;align-items:center;padding:14px 16px;border-radius:var(--t-r);background:var(--t-card);box-shadow:var(--t-sh);margin-bottom:14px;position:relative;overflow:hidden}
.t-gauge{width:112px;height:184px;display:block}
.t-level{transition:transform .9s cubic-bezier(.2,.9,.25,1.15)}
.t-wave1{animation:t-wave 3.2s linear infinite}.t-wave2{animation:t-wave 5.4s linear infinite reverse}
@keyframes t-wave{from{transform:translateX(0)}to{transform:translateX(60px)}}
.t-bubble{animation:t-bub 3.6s ease-in infinite;opacity:0}
.t-bubble:nth-child(2){animation-delay:1.2s}.t-bubble:nth-child(3){animation-delay:2.3s}
@keyframes t-bub{0%{transform:translateY(0);opacity:0}15%{opacity:.7}100%{transform:translateY(-70px);opacity:0}}
.t-gauge-card.t-low .t-bubble{display:none}
.t-info{min-width:0}
.t-ml{display:flex;align-items:baseline;gap:4px;font-weight:800;line-height:1}
.t-ml-num{font-size:44px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.t-ml-unit{font-size:18px;color:var(--t-muted)}
.t-goal{margin-top:6px;font-size:14px;color:var(--t-muted);font-weight:600}
.t-status{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:6px 12px;border-radius:999px;font-size:14px;font-weight:700;background:var(--t-soft);color:var(--t-text)}
.t-status{flex-wrap:wrap;row-gap:2px;max-width:100%}.t-status b{font-variant-numeric:tabular-nums;white-space:nowrap}.t-status span{white-space:nowrap}
.t-st-near{background:color-mix(in srgb,var(--t-acc) 20%,var(--t-card))}
.t-st-ok{background:color-mix(in srgb,var(--t-p2) 22%,var(--t-card))}
.t-st-high{background:color-mix(in srgb,var(--t-p) 20%,var(--t-card))}
.t-left{margin-top:8px;font-size:13px;color:var(--t-muted)}
.t-gauge-card.t-cheer{animation:t-cheer .7s ease}
@keyframes t-cheer{30%{transform:scale(1.03)}60%{transform:scale(.99)}}
.t-sec{margin:0 2px 8px;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--t-muted)}
.t-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-bottom:10px}
.t-tile{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:96px;padding:10px 4px;border:0;border-radius:var(--t-r);background:var(--t-card);box-shadow:var(--t-sh);cursor:pointer;transition:transform .12s ease,box-shadow .12s ease;text-align:center;overflow:hidden}
.t-tile:active{transform:scale(.94)}
.t-tile .t-ico{width:38px;height:38px;display:flex;align-items:center;justify-content:center;color:var(--t-p)}
.t-tile .t-ico svg{width:100%;height:100%}
.t-emo{font-size:30px;line-height:1}
.t-tl{font-size:15px;font-weight:800;line-height:1.1;white-space:nowrap}
.t-ts{font-size:12px;color:var(--t-muted);font-weight:600;white-space:nowrap}
.t-tile-drink{background:linear-gradient(160deg,var(--t-card) 40%,var(--t-soft))}
.t-tile-photo{background:var(--t-card);outline:2px dashed color-mix(in srgb,var(--t-p) 35%,transparent);outline-offset:-6px;box-shadow:none}
.t-tile.t-pop::after{content:"";position:absolute;inset:0;border-radius:inherit;background:radial-gradient(circle at 50% 45%,color-mix(in srgb,var(--t-p) 35%,transparent),transparent 65%);animation:t-pop .55s ease-out forwards}
@keyframes t-pop{from{opacity:1;transform:scale(.4)}to{opacity:0;transform:scale(1.4)}}
.t-row2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-bottom:10px}
.t-row2 .t-tile{min-height:104px;flex-direction:row;justify-content:flex-start;gap:10px;padding:12px 14px;text-align:left}
.t-row2 .t-tile .t-ico{flex:none;width:40px;height:40px}
.t-tt{display:flex;flex-direction:column;gap:3px;min-width:0}
.t-tt .t-tl{white-space:normal}
.t-count{display:inline-block;margin-top:2px;padding:3px 9px;border-radius:999px;background:var(--t-soft);color:var(--t-ink);font-size:13px;font-weight:800;align-self:flex-start}
.t-train{position:relative;display:flex;flex-direction:column;justify-content:center;gap:8px;min-height:104px;padding:12px;border-radius:18px;background:var(--t-card);box-shadow:var(--t-sh)}
.t-train-q{display:flex;align-items:center;gap:8px;font-weight:800;font-size:15px}
.t-train-q .t-ico{width:28px;height:28px;color:var(--t-p)}.t-train-q .t-ico svg{width:100%;height:100%}.t-train-q .t-emo{font-size:22px}
.t-train-btns{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.t-train-btns button{min-height:48px;border:0;border-radius:12px;background:var(--t-soft);font-weight:800;font-size:15px;cursor:pointer}
.t-train-btns button:active{transform:scale(.95)}
.t-train.t-ask{outline:2px solid color-mix(in srgb,var(--t-acc) 70%,transparent);animation:t-glow 2.4s ease-in-out infinite}
@keyframes t-glow{50%{box-shadow:0 0 0 6px color-mix(in srgb,var(--t-acc) 18%,transparent),var(--t-sh)}}
.t-train-set{display:flex;align-items:center;gap:10px;width:100%;min-height:80px;padding:0;border:0;background:none;text-align:left;cursor:pointer}
.t-train.t-on{background:var(--t-gs);color:#fff}
.t-train.t-on .t-ico,.t-train.t-on .t-ts{color:#fff}
.t-train.t-on .t-ts{opacity:.9}
.t-train-set .t-ico{flex:none;width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:var(--t-muted)}
.t-train-set .t-ico svg{width:100%;height:100%}
.t-train.t-off .t-tl{color:var(--t-muted)}
.t-night{display:flex;align-items:center;gap:10px;width:100%;min-height:52px;margin:4px 0 18px;padding:8px 14px;border:0;border-radius:14px;background:color-mix(in srgb,var(--t-calm) 10%,var(--t-card));font-size:15px!important;text-align:left;cursor:pointer}
.t-night .t-ico{width:24px;height:24px;color:var(--t-calm);flex:none}.t-night .t-ico svg{width:100%;height:100%}.t-night .t-emo{font-size:20px}
.t-night span.t-nt{flex:1;min-width:0}
.t-night b{font-weight:700}
.t-night .t-go{color:var(--t-ink);font-weight:700;white-space:nowrap}
.t-night.t-open{outline:2px dashed color-mix(in srgb,var(--t-calm) 35%,transparent);outline-offset:-2px}
.t-list-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
.t-sum{font-size:13px;color:var(--t-muted);font-weight:600}
.t-list{list-style:none;margin:0;padding:0;border-radius:var(--t-r);background:var(--t-card);box-shadow:var(--t-sh);overflow:hidden}
.t-item{position:relative;overflow:hidden;border-bottom:1px solid var(--t-line)}
.t-item:last-child{border-bottom:0}
.t-del-bg{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;padding-right:18px;background:var(--t-calm);color:#fff;font-weight:700;font-size:14px}
.t-row{position:relative;display:grid;grid-template-columns:48px 36px minmax(0,1fr) auto 18px;align-items:center;gap:8px;width:100%;min-height:56px;padding:6px 12px;border:0;background:var(--t-card);text-align:left;cursor:pointer;touch-action:pan-y;transition:transform .2s ease}
.t-row.t-drag{transition:none}
.t-row:active{background:var(--t-soft)}
.t-time{font-variant-numeric:tabular-nums;font-weight:700;font-size:15px}
.t-ri{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:var(--t-soft);color:var(--t-p);overflow:hidden}
.t-ri svg{width:22px;height:22px}.t-ri .t-emo{font-size:18px}.t-ri img{width:100%;height:100%;object-fit:cover}
.t-rl{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:15px;font-weight:600}
.t-rl small{color:var(--t-muted);font-weight:500}
.t-rml{font-weight:800;font-variant-numeric:tabular-nums;font-size:15px}
.t-chev{color:var(--t-muted);font-size:18px;line-height:1}
.t-empty{padding:22px 18px;text-align:center;color:var(--t-muted);font-size:15px;line-height:1.45}
.t-empty b{color:var(--t-text)}
.t-hint-swipe{margin:8px 4px 0;font-size:12px;color:var(--t-muted);text-align:center}
/* Sheets */
.t-sheet{color:var(--t-text)}
.t-sheet h3{margin:14px 0 8px;font-size:14px;font-weight:700;color:var(--t-muted)}
.t-sheet h3:first-child{margin-top:2px}
.t-chips{display:flex;flex-wrap:wrap;gap:8px}
.t-chip{display:inline-flex;flex-direction:column;align-items:center;justify-content:center;min-height:48px;min-width:64px;padding:6px 14px;border:2px solid transparent;border-radius:16px;background:var(--t-soft);font-weight:700!important;font-size:15px!important;cursor:pointer;line-height:1.15}
.t-chip small{font-size:12px;font-weight:600;color:var(--t-muted)}
.t-chip:active{transform:scale(.95)}
.t-chip[aria-pressed="true"]{background:var(--t-ink);color:#fff!important;border-color:var(--t-ink)}
.t-chip[aria-pressed="true"] small{color:#fff;opacity:.9}
.t-chip:disabled{opacity:.38;cursor:default;transform:none}
.t-chips-3 .t-chip{flex:1 1 0}.t-chips-rel,.t-chips-part{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.t-chips-part{grid-template-columns:repeat(3,minmax(0,1fr))}.t-chips-rel .t-chip,.t-chips-part .t-chip{min-width:0;padding:6px 8px}
.t-chip-calm[aria-pressed="true"]{background:var(--t-calm);border-color:var(--t-calm)}
.t-now{margin:0;padding:12px 14px;border-radius:14px;background:var(--t-soft);font-size:15px}
.t-now b{font-size:20px;font-variant-numeric:tabular-nums}
.t-note{margin:8px 0 0;font-size:13px;color:var(--t-muted)}
.t-sheet-foot{display:flex;gap:10px;margin-top:18px}
.t-btn{flex:1;min-height:52px;padding:0 16px;border:0;border-radius:16px;background:var(--t-soft);font-weight:800!important;font-size:16px!important;cursor:pointer}
.t-btn-primary{background:var(--t-gs);color:#fff!important}
.t-btn-ghost{flex:0 0 auto;background:transparent;color:var(--t-muted)!important;text-decoration:underline;text-underline-offset:3px;font-weight:600!important}
.t-btn:disabled{opacity:.5}
.t-photo{display:block;width:100%;max-height:240px;object-fit:cover;border-radius:16px;background:var(--t-soft)}
.t-photo-none{display:flex;align-items:center;justify-content:center;height:120px;border-radius:16px;background:var(--t-soft);color:var(--t-muted);font-size:14px;text-align:center;padding:10px}
.t-bed{margin-top:18px;padding-top:12px;border-top:1px dashed var(--t-line);transition:opacity .3s ease}
.t-bed[hidden]{display:block!important;opacity:.35;pointer-events:none}
.t-bed h3{font-size:13px;font-weight:600}
.t-bed .t-chip{min-height:48px;font-size:14px!important;font-weight:600!important}
.t-small{margin:14px 0 0;font-size:12px;color:var(--t-muted);text-align:center}
.t-link{display:block;margin:12px auto 0;padding:10px;border:0;background:none;color:var(--t-muted)!important;font-size:13px!important;text-decoration:underline;cursor:pointer}
/* Fallbacks (nur ohne Emly.ui) */
.t-fb-toast{position:fixed;left:12px;right:12px;bottom:84px;z-index:9999;display:flex;align-items:center;gap:8px;padding:12px 14px;border-radius:16px;background:#12304a;color:#fff;font-size:15px;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.t-fb-toast span{flex:1}.t-fb-toast button{min-height:40px;padding:0 10px;border:0;border-radius:10px;background:rgba(255,255,255,.15);color:#fff;font-weight:700}
.t-fb-back{position:fixed;inset:0;z-index:9990;background:rgba(10,25,40,.4)}
.t-fb-sheet{position:fixed;left:0;right:0;bottom:0;z-index:9991;max-height:88vh;overflow:auto;padding:18px 16px calc(18px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;background:var(--t-card);color:var(--t-text)}
.t-fb-title{margin:0 0 10px;font-size:20px}
@media (max-width:370px){.t-tl{font-size:14px}.t-ml-num{font-size:40px}.t-gauge-card{grid-template-columns:100px 1fr;gap:10px}.t-gauge{width:100px;height:166px}.t-row{grid-template-columns:44px 34px minmax(0,1fr) auto 14px;gap:6px;padding:6px 10px}}
@media (prefers-reduced-motion:reduce){.t-wave1,.t-wave2,.t-bubble,.t-train.t-ask,.t-gauge-card.t-cheer{animation:none}.t-level{transition:none}}
`;
    document.head.append(h('style', { id: 'today-styles' }, css));
  }

  /* ================= Hilfsfunktionen ================= */
  let root = null, refs = {}, offset = 0, rafId = 0, unsubs = [], lastMl = null, svgUid = 0;
  const thumbs = new Map(); // photoId -> objectURL

  const todayK = () => S().todayKey();
  const viewKey = () => (offset === 0 ? todayK() : U.addDays(todayK(), -1));
  const units = () => S().getSettings().units;

  function dateLabel(key) {
    const d = U.keyToDate(key);
    return U.weekdayLong(key) + ', ' + d.getDate() + '. ' + U.monthName(d.getMonth());
  }
  function dayWord(key) {
    const t = todayK();
    if (key === t) return 'heute';
    if (key === U.addDays(t, -1)) return 'gestern';
    return 'am ' + U.fmtDateShort(key);
  }
  function tsAt(key, hour, minute) {
    const d = U.keyToDate(key);
    d.setHours(hour, minute || 0, 0, 0);
    return d;
  }
  function entryLabel(e) {
    if (e.type === 'toilet') return 'Toilette';
    const d = DRINK[e.drink] || DRINK.sonstiges;
    return UNIT_LABEL[e.unit] + ' · ' + d.label;
  }
  function status(pct, ml) {
    if (ml <= 0) return { cls: 't-st-low', text: 'Los geht’s!' };
    if (pct < 70) return { cls: 't-st-low', text: 'Da geht noch was' };
    if (pct < 100) return { cls: 't-st-near', text: 'Fast geschafft!' };
    if (pct <= 160) return { cls: 't-st-ok', text: 'Ziel geschafft!' };
    return { cls: 't-st-high', text: 'Ganz schön viel heute' };
  }
  function chip(label, sub, opts) {
    const o = opts || {};
    const b = h('button', { type: 'button', class: 't-chip' + (o.cls ? ' ' + o.cls : ''), 'aria-pressed': o.pressed ? 'true' : 'false', disabled: !!o.disabled },
      h('span', null, label), sub ? h('small', null, sub) : null);
    if (o.onClick) b.addEventListener('click', () => { ui.haptic(10); o.onClick(b); });
    return b;
  }
  function press(group, btn) {
    group.querySelectorAll('.t-chip').forEach(c => c.setAttribute('aria-pressed', c === btn ? 'true' : 'false'));
  }

  /** Zeit-Chips für einen Tag. onPick(isoTs, chipEl). Zukünftige / tagesfremde Zeiten sind deaktiviert. */
  function timeChips(key, onPick, preselect) {
    const wrap = h('div');
    const now = Date.now();
    const st = S();
    const all = [];
    if (key === todayK()) {
      const rel = h('div', { class: 't-chips t-chips-rel' });
      REL_CHIPS.forEach(c => {
        const b = chip(c.label, null, {
          pressed: preselect === c.id,
          onClick: btn => { pressAll(btn); onPick(new Date(Date.now() - c.min * 60000).toISOString(), btn); }
        });
        b.dataset.chip = c.id;
        rel.append(b); all.push(b);
      });
      wrap.append(rel);
    }
    const parts = h('div', { class: 't-chips t-chips-part', style: { marginTop: '8px' } });
    PART_CHIPS.forEach(c => {
      const d = tsAt(key, c.h);
      const bad = d.getTime() > now + 60000 || st.dayKeyOf(d) !== key;
      const b = chip(c.label, c.h + ':00', {
        disabled: bad, pressed: preselect === c.id,
        onClick: btn => { pressAll(btn); onPick(d.toISOString(), btn); }
      });
      b.dataset.chip = c.id;
      parts.append(b); all.push(b);
    });
    wrap.append(parts);
    function pressAll(btn) { all.forEach(c => c.setAttribute('aria-pressed', c === btn ? 'true' : 'false')); }
    return wrap;
  }

  function unitChips(selected, onPick) {
    const g = h('div', { class: 't-chips t-chips-3' });
    const u = units();
    UNITS.forEach(x => {
      g.append(chip(x.label, fmtNum(u[x.id]) + ' ml', { pressed: selected === x.id, onClick: b => { press(g, b); onPick(x.id); } }));
    });
    return g;
  }
  function drinkChips(selected, onPick) {
    const g = h('div', { class: 't-chips' });
    DRINKS.forEach(d => g.append(chip(d.emo + ' ' + d.label, null, { pressed: selected === d.id, onClick: b => { press(g, b); onPick(d.id); } })));
    return g;
  }

  /* ================= Aktionen ================= */
  function afterAdd(e, beforePct) {
    const key = S().dayKeyOf(e.ts);
    const t = S().dayTotals(key);
    let msg;
    if (e.type === 'toilet') msg = 'Toilette eingetragen · ' + t.toilets + '× ' + dayWord(key);
    else msg = '+' + fmtNum(e.ml) + ' ml · ' + entryLabel(e);
    if (key !== todayK() && offset === 0) msg += ' (' + dayWord(key) + ')';
    ui.toast(msg, {
      duration: 5000,
      actions: [
        { label: 'Zeit ändern', onClick: () => openTimeSheet(e.id) },
        { label: 'Rückgängig', onClick: () => undoAdd(e.id) }
      ]
    });
    if (e.type === 'drink') {
      ui.sound('plop');
      if (beforePct < 100 && t.pct >= 100) {
        ui.confetti();
        ui.sound('yay');
        if (refs.card) { refs.card.classList.remove('t-cheer'); void refs.card.offsetWidth; refs.card.classList.add('t-cheer'); }
      }
    }
    schedule();
  }
  function undoAdd(id) {
    if (!S().getEntry(id)) return;
    S().removeEntry(id);
    ui.haptic(10);
    ui.toast('Rückgängig gemacht', { duration: 1800 });
    schedule();
  }
  function add(data, key) {
    const before = S().dayTotals(key || viewKey()).pct;
    const e = S().addEntry(data);
    afterAdd(e, before);
    return e;
  }
  function popTile(tile) {
    if (!tile || reduceMotion()) return;
    tile.classList.remove('t-pop'); void tile.offsetWidth; tile.classList.add('t-pop');
    setTimeout(() => tile.classList.remove('t-pop'), 600);
  }

  /** Kachel-Tap: heute sofort eintragen, beim Nachtragen erst Tageszeit wählen (insgesamt 2 Taps). */
  function quick(kind, tile) {
    ui.haptic(15);
    popTile(tile);
    const data = kind === 'toilet' ? { type: 'toilet' } : { type: 'drink', unit: kind, ml: units()[kind], drink: 'wasser' };
    if (offset === 0) { add(data); return; }
    const key = viewKey();
    const what = kind === 'toilet' ? 'Toilette' : UNIT_LABEL[kind] + ' · ' + fmtNum(data.ml) + ' ml';
    let sh = null;
    const body = h('div', null,
      h('p', { class: 't-now' }, what, ' ', h('b', null, dayWord(key))),
      h('h3', null, 'Wann ungefähr?'),
      timeChips(key, ts => { sh.close(); add(Object.assign({}, data, { ts }), key); })
    );
    sh = openSheet('Wann ' + dayWord(key) + '?', body);
  }

  function setTraining(val) {
    ui.haptic(15);
    S().setDay(viewKey(), { training: val });
    schedule();
  }

  function deleteEntry(id) {
    const e = S().removeEntry(id, { keepPhoto: true });
    if (!e) return;
    ui.haptic(20);
    let undone = false;
    ui.toast(e.type === 'toilet' ? 'Toilette gelöscht' : fmtNum(e.ml) + ' ml gelöscht', {
      duration: 5000,
      actions: [{
        label: 'Rückgängig', onClick: () => {
          if (undone) return;
          undone = true;
          S().addEntry(e);
          schedule();
        }
      }]
    });
    if (e.photoId) setTimeout(() => { if (!undone) S().deletePhoto(e.photoId); }, 7000);
    schedule();
  }

  /* ================= Sheets ================= */
  function openTimeSheet(entryId) {
    const st = S();
    const e0 = st && st.getEntry(entryId);
    if (!e0) { ui.toast('Eintrag nicht gefunden'); return null; }
    const key0 = st.dayKeyOf(e0.ts);
    const nowB = h('b', null, U.fmtTime(e0.ts));
    const note = h('p', { class: 't-note', hidden: true });
    const nowP = h('p', { class: 't-now' }, entryLabel(e0) + (e0.type === 'drink' ? ' · ' + fmtNum(e0.ml) + ' ml' : '') + ' – um ', nowB, ' Uhr');
    let pre = null;
    if (key0 === todayK() && Math.abs(Date.now() - new Date(e0.ts).getTime()) < 5 * 60000) pre = 'r0';
    const refreshHead = () => {
      const e = st.getEntry(entryId);
      if (!e) return;
      nowB.textContent = U.fmtTime(e.ts);
      nowP.firstChild.textContent = entryLabel(e) + (e.type === 'drink' ? ' · ' + fmtNum(e.ml) + ' ml' : '') + ' – um ';
      const k = st.dayKeyOf(e.ts);
      note.hidden = k === key0;
      note.textContent = k !== key0 ? 'Zählt jetzt zu ' + dayWord(k) + '.' : '';
    };
    const body = h('div', null, nowP,
      h('h3', null, 'Wann war das?'),
      timeChips(key0, ts => { st.updateEntry(entryId, { ts }); refreshHead(); }, pre),
      note);
    if (e0.type === 'drink') {
      body.append(
        h('h3', null, 'Wie viel?'),
        unitChips(e0.unit, unit => { st.updateEntry(entryId, { unit, ml: units()[unit] }); refreshHead(); }),
        h('h3', null, 'Was?'),
        drinkChips(e0.drink, drink => { st.updateEntry(entryId, { drink }); refreshHead(); })
      );
    }
    let sh = null;
    body.append(h('div', { class: 't-sheet-foot' },
      h('button', { type: 'button', class: 't-btn t-btn-ghost', onclick: () => { sh.close(); deleteEntry(entryId); } }, 'Löschen'),
      h('button', { type: 'button', class: 't-btn t-btn-primary', onclick: () => sh.close() }, 'Fertig')));
    sh = openSheet('Eintrag ändern', body, () => schedule());
    return sh;
  }

  /** Nacht-Sheet: Toilette nachts (0/1/2+) und dezent darunter „Und das Bett?“ – nie Pflicht. */
  function openNightSheet(key, opts) {
    const o = opts || {};
    const st = S();
    const cur = st.getDay(key).nightBefore;
    let nb = cur ? Object.assign({}, cur) : null;
    let sh = null;
    const saveNb = () => st.setDay(key, { nightBefore: Object.assign({}, nb, { answeredAt: new Date().toISOString() }) });
    const bed = h('div', { class: 't-bed', hidden: !nb });
    const tGroup = h('div', { class: 't-chips t-chips-3' });
    [[0, 'Nein'], [1, '1×'], [2, '2× oder öfter']].forEach(([v, l]) => {
      tGroup.append(chip(l, null, {
        pressed: nb && nb.toilet === v,
        onClick: b => {
          press(tGroup, b);
          nb = { toilet: v, bed: nb ? nb.bed : null };
          saveNb();
          bed.hidden = false;
        }
      }));
    });
    const bGroup = h('div', { class: 't-chips t-chips-3' });
    const finish = msg => { sh.close(); if (msg) ui.toast(msg, { duration: 2200 }); };
    [['trocken', '☀️ alles trocken'], ['nass', '🌧️ nicht ganz'], [null, 'überspringen']].forEach(([v, l]) => {
      bGroup.append(chip(l, null, {
        cls: 't-chip-calm',
        pressed: v !== null && nb && nb.bed === v,
        onClick: b => {
          if (!nb) return;
          press(bGroup, b);
          nb.bed = v;
          saveNb();
          setTimeout(() => finish(o.morning ? 'Danke! Hab einen guten Tag ☀️' : 'Gespeichert'), 180);
        }
      }));
    });
    bed.append(h('h3', null, 'Und das Bett?'), bGroup);
    const body = h('div', null,
      h('h3', null, 'Warst du nachts auf Toilette?'), tGroup, bed,
      h('p', { class: 't-small' }, 'Kurz eintragen reicht – alles ist okay.'));
    if (!o.morning && cur) {
      body.append(h('button', { type: 'button', class: 't-link', onclick: () => { st.setDay(key, { nightBefore: null }); finish('Nacht-Eintrag entfernt'); } }, 'Nacht-Eintrag entfernen'));
    }
    const title = o.morning ? 'Guten Morgen! Kurz zur Nacht:' : 'Die Nacht vor ' + (key === todayK() ? 'heute' : dayWord(key) === 'gestern' ? 'gestern' : U.fmtDateShort(key));
    sh = openSheet(title, body, () => { schedule(); o.onClose && o.onClose(); });
    return sh;
  }

  /* --- Foto --- */
  function compressImage(file, max, quality) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
          if (!w0 || !h0) throw new Error('Bild leer');
          const s = Math.min(1, max / Math.max(w0, h0));
          const w = Math.max(1, Math.round(w0 * s)), hh = Math.max(1, Math.round(h0 * s));
          const c = document.createElement('canvas');
          c.width = w; c.height = hh;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, w, hh);
          ctx.drawImage(img, 0, 0, w, hh);
          c.toBlob(b => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('toBlob fehlgeschlagen')); }, 'image/jpeg', quality);
        } catch (err) { URL.revokeObjectURL(url); reject(err); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Bild nicht lesbar')); };
      img.src = url;
    });
  }
  async function onPhotoChosen(ev) {
    const input = ev.target;
    const file = input.files && input.files[0];
    input.value = ''; // gleiches Foto später erneut wählbar
    if (!file) return;
    let blob = null;
    try { blob = await compressImage(file, 480, 0.7); } catch (err) { console.warn('[today] Foto', err); }
    openPhotoSheet(blob);
  }
  function openPhotoSheet(blob) {
    const st = S();
    const settings = st.getSettings();
    const key = viewKey();
    const url = blob ? URL.createObjectURL(blob) : null;
    let unit = 'glass', drink = 'wasser', ts = offset === 0 ? null : undefined; // null = jetzt, undefined = noch wählen
    let sh = null, saving = false;
    const timeHint = h('p', { class: 't-note', hidden: true }, 'Wähl noch, wann ungefähr.');
    const saveBtn = h('button', { type: 'button', class: 't-btn t-btn-primary' }, 'Speichern');
    const body = h('div', null,
      url ? h('img', { class: 't-photo', src: url, alt: 'Dein Foto' }) : h('div', { class: 't-photo-none' }, 'Das Foto ließ sich nicht öffnen – du kannst trotzdem eintragen.'),
      h('p', { class: 't-note' }, settings.savePhotos
        ? 'Das Foto schätzt nicht automatisch – wähl selbst, wie viel es war.'
        : 'Foto wird nicht gespeichert (Einstellung) – wähl, wie viel es war.'),
      h('h3', null, 'Wie viel?'), unitChips(unit, u => { unit = u; }),
      h('h3', null, 'Was?'), drinkChips(drink, d => { drink = d; }),
      h('h3', null, 'Wann?'), timeChips(key, t => { ts = t; timeHint.hidden = true; }, offset === 0 ? 'r0' : null),
      timeHint,
      h('div', { class: 't-sheet-foot' },
        h('button', { type: 'button', class: 't-btn', onclick: () => sh.close() }, 'Abbrechen'),
        saveBtn));
    saveBtn.addEventListener('click', async () => {
      if (saving) return;
      if (ts === undefined) { timeHint.hidden = false; ui.haptic([10, 40, 10]); return; }
      saving = true;
      saveBtn.disabled = true;
      let photoId = null;
      if (blob && st.getSettings().savePhotos) {
        try { photoId = await st.putPhoto(blob); } catch (err) { photoId = null; }
      }
      const data = { type: 'drink', unit, ml: units()[unit], drink };
      if (ts) data.ts = ts;
      if (photoId) data.photoId = photoId;
      sh.close();
      add(data, key);
      if (blob && settings.savePhotos && !photoId) ui.toast('Eingetragen – Foto konnte nicht gespeichert werden', { duration: 3500 });
    });
    sh = openSheet('Foto-Eintrag', body, () => { if (url) setTimeout(() => URL.revokeObjectURL(url), 400); });
  }

  /* ================= Morgen-Check ================= */
  let morningOpen = false;
  function dismissed() { try { return sessionStorage.getItem(MORNING_KEY); } catch (_) { return null; } }
  function markDismissed(k) { try { sessionStorage.setItem(MORNING_KEY, k); } catch (_) { /* egal */ } }
  function checkMorning() {
    try {
      const st = S();
      if (!st || morningOpen) return false;
      const key = st.todayKey();
      const hr = new Date().getHours();
      if (hr < Math.max(4, st.getSettings().dayStartHour) || hr >= 14) return false;
      if (st.getDay(key).nightBefore) return false;
      if (dismissed() === key) return false;
      morningOpen = true;
      openNightSheet(key, { morning: true, onClose: () => { morningOpen = false; markDismissed(key); } });
      return true;
    } catch (e) {
      console.error('[today] checkMorning', e);
      return false;
    }
  }

  /* ================= Aufbau ================= */
  function wavePath(amp, period, y0) {
    let d = 'M' + -period + ' ' + y0;
    for (let x = -period; x < 120 + period; x += period) d += ' q' + period / 4 + ' ' + -amp + ' ' + period / 2 + ' 0 t' + period / 2 + ' 0';
    return d + ' V 260 H ' + -period + ' Z';
  }
  function gaugeSVG() {
    const id = 't-clip-' + (++svgUid), gid = 't-grad-' + svgUid;
    const bottle = 'M48 14 H72 V30 C72 38 104 42 104 66 V172 C104 186 94 196 80 196 H40 C26 196 16 186 16 172 V66 C16 42 48 38 48 30 Z';
    return `<svg class="t-gauge" viewBox="0 0 120 200" role="img" aria-hidden="true">
  <defs>
    <clipPath id="${id}"><path d="${bottle}"/></clipPath>
    <linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--t-p)"/><stop offset="1" stop-color="var(--t-p2)"/></linearGradient>
  </defs>
  <path d="${bottle}" fill="var(--t-soft)"/>
  <g clip-path="url(#${id})">
    <g class="t-level" style="transform:translateY(${FILL_BOTTOM}px)">
      <path class="t-wave2" d="${wavePath(4, 60, -2)}" fill="var(--t-p)" opacity=".35"/>
      <path class="t-wave1" d="${wavePath(5, 60, 0)}" fill="url(#${gid})"/>
      <g fill="#fff" opacity=".8"><circle class="t-bubble" cx="40" cy="150" r="3"/><circle class="t-bubble" cx="70" cy="165" r="2.2"/><circle class="t-bubble" cx="84" cy="140" r="2.6"/></g>
    </g>
    <rect x="28" y="70" width="8" height="90" rx="4" fill="#fff" opacity=".35"/>
  </g>
  <path d="${bottle}" fill="none" stroke="var(--t-p)" stroke-width="3" stroke-linejoin="round" opacity=".55"/>
  <rect x="45" y="6" width="30" height="11" rx="4" fill="var(--t-p)" opacity=".8"/>
</svg>`;
  }

  function build() {
    refs = {};
    refs.hello = h('h1');
    refs.date = h('p', { class: 't-date' });
    refs.switchBtn = h('button', { type: 'button', class: 't-switch', onclick: () => { ui.haptic(10); offset = offset === 0 ? -1 : 0; lastMl = null; render(); } });
    const head = h('header', { class: 't-head' }, h('div', { class: 't-hello' }, refs.hello, refs.date), refs.switchBtn);
    refs.banner = h('div', { class: 't-banner' }, '✏️ ', h('span', null, 'Du trägst gerade für gestern nach.'));

    refs.card = h('section', { class: 't-gauge-card', 'aria-live': 'polite' });
    refs.card.innerHTML = gaugeSVG();
    refs.level = refs.card.querySelector('.t-level');
    refs.mlNum = h('span', { class: 't-ml-num' }, '0');
    refs.goal = h('div', { class: 't-goal' });
    refs.status = h('div', { class: 't-status' });
    refs.left = h('div', { class: 't-left' });
    refs.card.append(h('div', { class: 't-info' }, h('div', { class: 't-ml' }, refs.mlNum, h('span', { class: 't-ml-unit' }, 'ml')), refs.goal, refs.status, refs.left));

    // Trink-Kacheln + Foto
    refs.tiles = h('div', { class: 't-tiles' });
    refs.unitSubs = {};
    UNITS.forEach(u => {
      const sub = h('span', { class: 't-ts' });
      refs.unitSubs[u.id] = sub;
      const t = h('button', { type: 'button', class: 't-tile t-tile-drink', 'data-unit': u.id, 'aria-label': u.label + ' eintragen' },
        h('span', { class: 't-ico', html: ui.icon(u.icon, u.emo) }), h('span', { class: 't-tl' }, u.label), sub);
      t.addEventListener('click', () => quick(u.id, t));
      refs.tiles.append(t);
    });
    refs.file = h('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true, class: 't-file', 'aria-hidden': 'true', tabindex: '-1' });
    refs.file.addEventListener('change', onPhotoChosen);
    const photoTile = h('button', { type: 'button', class: 't-tile t-tile-photo', 'aria-label': 'Getränk per Foto eintragen' },
      h('span', { class: 't-ico', html: ui.icon('camera', '📷') }), h('span', { class: 't-tl' }, 'Foto'), h('span', { class: 't-ts' }, 'knipsen'));
    photoTile.addEventListener('click', () => { ui.haptic(10); refs.file.click(); });
    refs.tiles.append(photoTile);

    // Toilette + Training
    refs.toiletCount = h('span', { class: 't-count' });
    const toilet = h('button', { type: 'button', class: 't-tile t-tile-toilet', 'aria-label': 'Toilettengang eintragen' },
      h('span', { class: 't-ico', html: ui.icon('toilet', '🚽') }),
      h('span', { class: 't-tt' }, h('span', { class: 't-tl' }, 'War auf Toilette'), refs.toiletCount));
    toilet.addEventListener('click', () => quick('toilet', toilet));
    refs.train = h('div', { class: 't-train' });

    refs.night = h('button', { type: 'button', class: 't-night', onclick: () => { ui.haptic(10); openNightSheet(viewKey()); } });

    refs.listTitle = h('h2', { class: 't-sec' });
    refs.sum = h('span', { class: 't-sum' });
    refs.list = h('ul', { class: 't-list' });
    refs.swipeHint = h('p', { class: 't-hint-swipe' }, 'Tippen zum Ändern · nach links wischen zum Löschen');

    root.append(head, refs.banner, refs.card,
      h('h2', { class: 't-sec' }, 'Trinken'), refs.tiles, refs.file,
      h('div', { class: 't-row2' }, toilet, refs.train),
      refs.night,
      h('div', { class: 't-list-head' }, refs.listTitle, refs.sum), refs.list, refs.swipeHint);
  }

  /* ================= Rendern ================= */
  function schedule() {
    if (!root || rafId) return;
    rafId = requestAnimationFrame(() => { rafId = 0; render(); });
  }
  function tweenNumber(el, from, to) {
    if (from == null || from === to || reduceMotion()) { el.textContent = fmtNum(to); return; }
    const t0 = performance.now(), dur = 550;
    const step = t => {
      const p = Math.min(1, (t - t0) / dur), k = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(from + (to - from) * k);
      if (p < 1 && el.isConnected) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function render() {
    if (!root || !S()) return;
    const st = S();
    const key = viewKey();
    const isToday = offset === 0;
    const set = st.getSettings();
    const t = st.dayTotals(key);
    root.classList.toggle('t-past', !isToday);

    refs.hello.textContent = 'Hey ' + (set.name || 'Emily') + '!';
    refs.date.textContent = (isToday ? '' : 'Gestern · ') + dateLabel(key);
    refs.switchBtn.textContent = isToday ? '◀ Gestern' : 'Heute ▶';
    refs.switchBtn.setAttribute('aria-label', isToday ? 'Gestern nachtragen' : 'Zurück zu heute');

    // Füllstand
    const fill = U.clamp(t.pct, 0, 100);
    const vis = t.ml > 0 ? Math.max(4, fill) : 0;
    const y = FILL_BOTTOM - ((FILL_BOTTOM - FILL_TOP) * vis) / 100 + (vis === 0 ? 8 : 0);
    refs.level.style.transform = 'translateY(' + y.toFixed(1) + 'px)';
    refs.card.classList.toggle('t-low', fill < 35);
    tweenNumber(refs.mlNum, lastMl, t.ml);
    lastMl = t.ml;
    refs.goal.textContent = 'von ' + fmtNum(t.goal) + ' ml' + (t.training === true ? ' · ⚽ Trainingstag' : '');
    const s = status(t.pct, t.ml);
    refs.status.className = 't-status ' + s.cls;
    refs.status.innerHTML = '<b>' + t.pct + '\u00a0%</b> <span>' + U.esc(s.text) + '</span>';
    refs.left.textContent = t.ml < t.goal ? 'Noch ' + fmtNum(t.goal - t.ml) + ' ml bis zum Ziel' : '';
    refs.card.setAttribute('aria-label', fmtNum(t.ml) + ' von ' + fmtNum(t.goal) + ' Milliliter, ' + t.pct + ' Prozent');

    const u = set.units;
    UNITS.forEach(x => { refs.unitSubs[x.id].textContent = fmtNum(u[x.id]) + ' ml'; });
    refs.toiletCount.textContent = t.toilets + '× ' + (isToday ? 'heute' : 'gestern');

    renderTraining(t, set, isToday);
    renderNight(t);
    renderList(key, t, isToday);
  }

  function renderTraining(t, set, isToday) {
    const el = refs.train;
    el.innerHTML = '';
    el.className = 't-train';
    const ball = ui.icon('ball', '⚽');
    if (t.training === null) {
      el.classList.add('t-ask');
      el.setAttribute('role', 'group');
      el.setAttribute('aria-label', 'Training ' + (isToday ? 'heute' : 'gestern') + '?');
      el.append(
        h('div', { class: 't-train-q' }, h('span', { class: 't-ico', html: ball }), isToday ? 'Training heute?' : 'Training gestern?'),
        h('div', { class: 't-train-btns' },
          h('button', { type: 'button', 'data-train': 'yes', onclick: () => setTraining(true) }, 'Ja'),
          h('button', { type: 'button', 'data-train': 'no', onclick: () => setTraining(false) }, 'Nein')));
      return;
    }
    el.removeAttribute('role');
    el.classList.add(t.training ? 't-on' : 't-off');
    const btn = h('button', {
      type: 'button', class: 't-train-set', 'data-train': 'toggle', 'aria-pressed': t.training ? 'true' : 'false',
      onclick: () => setTraining(!t.training)
    },
      h('span', { class: 't-ico', html: ball }),
      h('span', { class: 't-tt' },
        h('span', { class: 't-tl' }, t.training ? 'Training ' + (isToday ? 'heute' : 'gestern') : 'Kein Training'),
        h('span', { class: 't-ts' }, 'Ziel ' + fmtNum(t.training ? set.goalTraining : set.goalBase) + ' ml')));
    el.append(btn);
  }

  function renderNight(t) {
    const nb = t.nightBefore;
    const el = refs.night;
    el.innerHTML = '';
    el.classList.toggle('t-open', !nb);
    let txt;
    if (!nb) txt = h('span', { class: 't-nt' }, h('b', null, 'Nacht: '), 'noch offen');
    else txt = h('span', { class: 't-nt' }, h('b', null, 'Nacht: '), nb.toilet === 0 ? 'keine Toilette' : nb.toilet === 1 ? '1× Toilette' : '2× oder öfter Toilette');
    el.append(h('span', { class: 't-ico', html: ui.icon('moon', '🌙') }), txt, h('span', { class: 't-go' }, nb ? 'ändern ›' : 'nachtragen ›'));
    el.setAttribute('aria-label', 'Nacht ' + (nb ? 'ändern' : 'nachtragen'));
  }

  function renderList(key, t, isToday) {
    const st = S();
    const entries = st.entriesForDay(key);
    refs.listTitle.textContent = isToday ? 'Heute eingetragen' : 'Gestern eingetragen';
    refs.sum.textContent = entries.length ? t.drinks + (t.drinks === 1 ? ' Getränk' : ' Getränke') + ' · ' + t.toilets + '× Toilette' : '';
    refs.list.innerHTML = '';
    refs.swipeHint.hidden = !entries.length;
    if (!entries.length) {
      refs.list.append(h('li', { class: 't-empty' }, isToday
        ? h('span', null, 'Noch nichts eingetragen.', h('br'), 'Ein Tap auf ', h('b', null, 'Glas'), ' reicht schon!')
        : h('span', null, 'Für gestern ist noch nichts da.', h('br'), 'Tipp eine Kachel an und wähl die Tageszeit.')));
      return;
    }
    // neueste oben – das, was man gerade eingetragen hat, ist sofort sichtbar
    entries.slice().reverse().forEach(e => refs.list.append(itemRow(e)));
  }

  function itemRow(e) {
    const icon = h('span', { class: 't-ri' });
    if (e.type === 'toilet') icon.innerHTML = ui.icon('toilet', '🚽');
    else if (e.photoId) { icon.innerHTML = ui.icon('camera', '📷'); loadThumb(e.photoId, icon); }
    else icon.innerHTML = ui.icon(e.unit === 'bottle' ? 'bottle' : e.unit === 'half' ? 'glass-half' : 'glass', DRINK[e.drink] ? DRINK[e.drink].emo : '🥤');
    const label = e.type === 'toilet' ? h('span', { class: 't-rl' }, 'Toilette')
      : h('span', { class: 't-rl' }, UNIT_LABEL[e.unit] + ' ', h('small', null, (DRINK[e.drink] || DRINK.sonstiges).label));
    const row = h('button', { type: 'button', class: 't-row', 'data-id': e.id, 'aria-label': U.fmtTime(e.ts) + ' ' + entryLabel(e) + ' – ändern' },
      h('span', { class: 't-time' }, U.fmtTime(e.ts)), icon, label,
      h('span', { class: 't-rml' }, e.type === 'drink' ? fmtNum(e.ml) + ' ml' : ''),
      h('span', { class: 't-chev', 'aria-hidden': 'true' }, '›'));
    const li = h('li', { class: 't-item' }, h('div', { class: 't-del-bg', 'aria-hidden': 'true' }, 'Löschen'), row);
    attachSwipe(row, e.id);
    return li;
  }

  function loadThumb(photoId, el) {
    const put = url => { el.innerHTML = ''; el.append(h('img', { src: url, alt: '' })); };
    if (thumbs.has(photoId)) { put(thumbs.get(photoId)); return; }
    S().getPhotoURL(photoId).then(url => {
      if (!url) return;
      if (!root) { URL.revokeObjectURL(url); return; }
      thumbs.set(photoId, url);
      if (el.isConnected) put(url);
    }).catch(() => { /* Vorschau ist optional */ });
  }

  /** Wischen nach links löscht (mit Rückgängig), Tippen öffnet „Eintrag ändern“. */
  function attachSwipe(row, id) {
    let x0 = 0, y0 = 0, dx = 0, active = false, swiping = false, suppress = false, pid = null;
    row.addEventListener('pointerdown', ev => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      active = true; swiping = false; dx = 0; x0 = ev.clientX; y0 = ev.clientY; pid = ev.pointerId;
    });
    row.addEventListener('pointermove', ev => {
      if (!active || ev.pointerId !== pid) return;
      const mx = ev.clientX - x0, my = ev.clientY - y0;
      if (!swiping) {
        if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { active = false; return; }
        if (mx < -12 && Math.abs(mx) > Math.abs(my)) {
          swiping = true; row.classList.add('t-drag');
          try { row.setPointerCapture(pid); } catch (_) { /* egal */ }
        }
      }
      if (swiping) { dx = Math.min(0, mx); row.style.transform = 'translateX(' + dx + 'px)'; }
    });
    const end = () => {
      if (!active) return;
      active = false;
      if (!swiping) return;
      suppress = true;
      setTimeout(() => { suppress = false; }, 350);
      row.classList.remove('t-drag');
      if (dx < -Math.min(110, row.offsetWidth * 0.3)) {
        row.style.transform = 'translateX(-100%)';
        setTimeout(() => deleteEntry(id), 160);
      } else row.style.transform = '';
    };
    row.addEventListener('pointerup', end);
    row.addEventListener('pointercancel', () => { if (swiping) { row.classList.remove('t-drag'); row.style.transform = ''; } active = false; });
    row.addEventListener('click', ev => {
      if (suppress) { ev.preventDefault(); return; }
      ui.haptic(10);
      openTimeSheet(id);
    });
  }

  /* ================= Screen-Registrierung ================= */
  let dayTimer = 0, dayKeySeen = null;
  function checkDayChange() {
    if (!root || !S()) return false;
    const k = todayK();
    if (k === dayKeySeen) return false;
    dayKeySeen = k;
    offset = 0; lastMl = null;           // neuer Tag → zurück auf „heute“, Füllstand ohne Zähl-Animation
    render();
    if (document.visibilityState === 'visible') checkMorning();
    return true;
  }
  function onVisible() { if (document.visibilityState === 'visible') { if (!checkDayChange()) schedule(); } }

  const screen = {
    title: 'Heute', icon: '💧', order: 10,
    mount(el) {
      injectStyles();
      if (root) screen.unmount();
      offset = 0; lastMl = null;
      root = h('div', { class: 't-root' });
      el.innerHTML = '';
      el.append(root);
      build();
      render();
      unsubs.push(E.bus.on('data:changed', p => { if (!p || p.kind !== 'game') schedule(); }));
      // store:error zeigt app.js global (alle Screens, auch vor dem Mount)
      document.addEventListener('visibilitychange', onVisible);
      // Tageswechsel (z. B. App über 4 Uhr offen): jede Minute prüfen, dann neu rendern + Morgen-Check
      dayKeySeen = todayK();
      dayTimer = setInterval(checkDayChange, 60000);
    },
    unmount() {
      clearInterval(dayTimer); dayTimer = 0;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      unsubs.forEach(fn => { try { fn(); } catch (_) { /* egal */ } });
      unsubs = [];
      document.removeEventListener('visibilitychange', onVisible);
      thumbs.forEach(url => URL.revokeObjectURL(url));
      thumbs.clear();
      if (root && root.parentNode) root.parentNode.removeChild(root);
      root = null; refs = {};
    },
    refresh() { schedule(); }
  };
  E.screens.register('heute', screen);

  E.today = { checkMorning, openTimeSheet, _checkDayChange: checkDayChange };
})();
