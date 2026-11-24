/* Emly – ui.js (Mira / Dev C)
 * Emly.ui: toast, sheet, confirm, confetti, haptic, sound, icon (+ mascot, closeAllSheets, isSheetOpen)
 * Signaturen laut SPEC §5 verbindlich. Liest Emly.store nur, wenn vorhanden (settings.sound/haptics).
 */
(function () {
  'use strict';
  const Emly = (window.Emly = window.Emly || {});

  const reducedMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const settings = () => {
    try { return (Emly.store && Emly.store.getSettings && Emly.store.getSettings()) || {}; } catch (e) { return {}; }
  };
  const layer = (id, cls) => {
    let el = document.getElementById(id);
    if (!el) { el = document.createElement('div'); el.id = id; if (cls) el.className = cls; document.body.appendChild(el); }
    return el;
  };
  const toNode = (body) => {
    if (body == null) return null;
    if (body.nodeType) return body;
    const d = document.createElement('div'); d.innerHTML = String(body); return d;
  };

  /* =================================================================
     ICONS – 24er Raster, 2px Linie, runde Enden, Duoton (Füllung 22 %)
     ================================================================= */
  const F = 'fill="currentColor" stroke="none" opacity=".22"';   // Duoton-Fläche
  const FS = 'fill="currentColor" stroke="none"';                  // volle Fläche
  const gearPath = (() => {                                        // 8 Zähne, generiert
    const cx = 12, cy = 12, rO = 9.6, rI = 7.4, n = 8; let d = '';
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, w = Math.PI / n * 0.55, s = Math.PI / n;
      const pts = [[rI, a - s + w * .2], [rO, a - w], [rO, a + w], [rI, a + s - w * .2]];
      pts.forEach(([r, t], j) => { d += (i === 0 && j === 0 ? 'M' : 'L') + (cx + r * Math.cos(t)).toFixed(2) + ' ' + (cy + r * Math.sin(t)).toFixed(2); });
    }
    return d + 'Z';
  })();
  const ICONS = {
    'drop': `<path d="M12 2.8c3.7 4.4 6.3 7.9 6.3 11.4a6.3 6.3 0 0 1-12.6 0C5.7 10.7 8.3 7.2 12 2.8z" ${F}/><path d="M12 2.8c3.7 4.4 6.3 7.9 6.3 11.4a6.3 6.3 0 0 1-12.6 0C5.7 10.7 8.3 7.2 12 2.8z"/><path d="M9 14.6a3 3 0 0 0 2.6 2.8"/>`,
    'glass-half': `<path d="M7.3 13.2c1.6-.9 3.1-.9 4.7 0s3.1.9 4.7 0l-.6 5.9a1.5 1.5 0 0 1-1.5 1.4H9.4a1.5 1.5 0 0 1-1.5-1.4z" ${F}/><path d="M5.5 3.5h13l-1.7 15.8a1.8 1.8 0 0 1-1.8 1.7H9a1.8 1.8 0 0 1-1.8-1.7z"/><path d="M7.1 13.2c1.6-.9 3.3-.9 4.9 0s3.3.9 4.9 0"/>`,
    'glass': `<path d="M6.5 8c1.8-.9 3.7-.9 5.5 0s3.7.9 5.5 0l-1.2 11.2a1.5 1.5 0 0 1-1.5 1.3H9.2a1.5 1.5 0 0 1-1.5-1.3z" ${F}/><path d="M5.5 3.5h13l-1.7 15.8a1.8 1.8 0 0 1-1.8 1.7H9a1.8 1.8 0 0 1-1.8-1.7z"/><path d="M6.3 8c1.9-.9 3.8-.9 5.7 0s3.8.9 5.7 0"/>`,
    'bottle': `<path d="M7 11.5c1.7-.8 3.3-.8 5 0s3.3.8 5 0V19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z" ${F}/><path d="M9.5 2.5h5v3h-5z"/><path d="M9.3 5.5h5.4c0 1.2 2.3 2 2.3 4.5V19a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 19v-9c0-2.5 2.3-3.3 2.3-4.5z"/><path d="M7 11.5c1.7-.8 3.3-.8 5 0s3.3.8 5 0"/>`,
    'camera': `<circle cx="12" cy="13.2" r="3.6" ${F}/><path d="M4.5 7.5h2.8l1.6-2.5h6.2l1.6 2.5h2.8a1.5 1.5 0 0 1 1.5 1.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="12" cy="13.2" r="3.6"/><path d="M17.6 10.4h.01"/>`,
    'toilet': `<path d="M4 11h16a7 7 0 0 1-7 6.5h-2A7 7 0 0 1 4 11z" ${F}/><path d="M6.5 3h4.5a1 1 0 0 1 1 1v7H5.5V4a1 1 0 0 1 1-1z"/><path d="M3.5 11h17a7 7 0 0 1-6 6.9l.6 3.1H8.9l.6-3.1A7 7 0 0 1 3.5 11z"/><path d="M8 6h1.5"/>`,
    'ball': `<circle cx="12" cy="12" r="9"/><path d="M12.00 8.40L15.42 10.89L14.12 14.91L9.88 14.91L8.58 10.89z" ${FS}/><path d="M12.00 5.70L7.96 4.07A9 9 0 0 1 16.04 4.07zM17.99 10.05L18.29 5.71A9 9 0 0 1 20.79 13.39zM15.70 17.10L19.93 16.04A9 9 0 0 1 13.39 20.79zM8.30 17.10L10.61 20.79A9 9 0 0 1 4.07 16.04zM6.01 10.05L3.21 13.39A9 9 0 0 1 5.71 5.71z" ${F}/><path d="M12.00 8.40L12.00 5.70M15.42 10.89L17.99 10.05M14.12 14.91L15.70 17.10M9.88 14.91L8.30 17.10M8.58 10.89L6.01 10.05M12.00 5.70L7.96 4.07M12.00 5.70L16.04 4.07M17.99 10.05L18.29 5.71M17.99 10.05L20.79 13.39M15.70 17.10L19.93 16.04M15.70 17.10L13.39 20.79M8.30 17.10L10.61 20.79M8.30 17.10L4.07 16.04M6.01 10.05L3.21 13.39M6.01 10.05L5.71 5.71" stroke-width="1.4"/>`,
    'moon': `<path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z" ${F}/><path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.3 6.3 0 0 0 10.1 10.1z"/><path d="M16.5 3.5v3M15 5h3"/>`,
    'sun': `<circle cx="12" cy="12" r="4.2" ${F}/><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>`,
    'sunrise': `<path d="M7.5 16a4.5 4.5 0 0 1 9 0z" ${F}/><path d="M7.5 16a4.5 4.5 0 0 1 9 0M3 16h18M6 20h12M12 3v4M9.5 5.5 12 3l2.5 2.5M4.6 10.6l1.4 1M19.4 10.6l-1.4 1"/>`,
    'cloud': `<path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 18.5z" ${F}/><path d="M7 18.5h10a4 4 0 0 0 .6-8 5.5 5.5 0 0 0-10.6 1.2A3.4 3.4 0 0 0 7 18.5z"/>`,
    'chart': `<rect x="10.3" y="5" width="3.4" height="15" rx="1.2" ${F}/><path d="M3.5 20.5h17"/><rect x="5" y="11" width="3.4" height="9" rx="1.2"/><rect x="10.3" y="5" width="3.4" height="15" rx="1.2"/><rect x="15.6" y="14" width="3.4" height="6" rx="1.2"/>`,
    'trophy': `<path d="M7.5 3.5h9v5.5a4.5 4.5 0 0 1-9 0z" ${F}/><path d="M7.5 3.5h9v5.5a4.5 4.5 0 0 1-9 0z"/><path d="M7.5 5.5H4.5a3.5 3.5 0 0 0 3.6 4.4M16.5 5.5h3a3.5 3.5 0 0 1-3.6 4.4M12 13.5V17M8 20.5h8M9.5 17h5l.5 3.5H9z"/>`,
    'gear': `<path d="${gearPath}" ${F}/><path d="${gearPath}"/><circle cx="12" cy="12" r="3"/>`,
    'flame': `<path d="M12 2.5c1 3.2 4.2 5.1 5.5 8.3A7 7 0 1 1 5 14.2c0-2.6 1.3-4.5 3-5.7.1 1.6.8 2.8 1.9 3.4C9.5 8.6 10.5 5 12 2.5z" ${F}/><path d="M12 2.5c1 3.2 4.2 5.1 5.5 8.3A7 7 0 1 1 5 14.2c0-2.6 1.3-4.5 3-5.7.1 1.6.8 2.8 1.9 3.4C9.5 8.6 10.5 5 12 2.5z"/><path d="M12 21.2a3 3 0 0 1-3-3c0-1.8 1.5-2.9 3-4.6 1.5 1.7 3 2.8 3 4.6a3 3 0 0 1-3 3z" ${FS} opacity=".55"/>`,
    'lock': `<rect x="5" y="10.5" width="14" height="10" rx="2.5" ${F}/><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>`,
    'star': `<path d="M12 3.3l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" ${F}/><path d="M12 3.3l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>`,
    'sparkle': `<path d="M12 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7z" ${F}/><path d="M12 3c.6 4.3 2.7 6.4 7 7-4.3.6-6.4 2.7-7 7-.6-4.3-2.7-6.4-7-7 4.3-.6 6.4-2.7 7-7zM19 16.5v4M17 18.5h4"/>`,
    'crown': `<path d="M4 8l4.2 3.8L12 5l3.8 6.8L20 8l-1.6 10H5.6z" ${F}/><path d="M4 8l4.2 3.8L12 5l3.8 6.8L20 8l-1.6 10H5.6zM5.6 21h12.8"/>`,
    'medal': `<circle cx="12" cy="15" r="5.5" ${F}/><path d="M8.5 3.5h7l-2 6M8.5 3.5l2 6"/><circle cx="12" cy="15" r="5.5"/><path d="M12 12.6l.8 1.6 1.7.2-1.2 1.2.3 1.7-1.6-.8-1.6.8.3-1.7-1.2-1.2 1.7-.2z" ${FS}/>`,
    'calendar': `<rect x="3.5" y="5" width="17" height="15.5" rx="3" ${F}/><rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8.5 14.8l2 2 4-4"/>`,
    'backpack': `<path d="M6 11h12v8.5a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19.5z" ${F}/><path d="M9 5.5V4.5a3 3 0 0 1 6 0v1"/><path d="M5 11a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v8.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5z"/><path d="M9 15h6v3H9zM5 11h14"/>`,
    'book': `<path d="M4.5 5.5A2 2 0 0 1 6.5 3.5h12v15h-12a2 2 0 0 0-2 2z" ${F}/><path d="M4.5 20.5v-15a2 2 0 0 1 2-2h12v15h-12a2 2 0 0 0-2 2zm0 0a2 2 0 0 0 2 0h12M9 8h5.5"/>`,
    'wave': `<path d="M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2-1.5 4.5-1.5S19 15 21 15v5.5H3z" ${F}/><path d="M3 10c2 0 2-1.5 4.5-1.5S10 10 12 10s2-1.5 4.5-1.5S19 10 21 10M3 15c2 0 2-1.5 4.5-1.5S10 15 12 15s2-1.5 4.5-1.5S19 15 21 15"/>`,
    'gem': `<path d="M7 4h10l4 5-9 11L3 9z" ${F}/><path d="M7 4h10l4 5-9 11L3 9zM3 9h18M9.5 4 8 9l4 11 4-11-1.5-5"/>`,
    'target': `<circle cx="12" cy="12" r="5" ${F}/><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" ${FS}/>`,
    'bolt': `<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z" ${F}/><path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>`,
    'cup': `<path d="M4.5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5z" ${F}/><path d="M4.5 9h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM16.5 10.5h1.3a2.5 2.5 0 0 1 0 5h-1.6M8 3.5c-.6.8-.6 1.7 0 2.5M12 3.5c-.6.8-.6 1.7 0 2.5M4 21.5h13"/>`,
    'milk': `<path d="M7 11h10v8.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5z" ${F}/><path d="M8.5 2.5h7v3l1.5 3v11a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19.5v-11l1.5-3zM7 8.5h10"/>`,
    'juice': `<path d="M6.6 10h10.8l-1 9.6a1.6 1.6 0 0 1-1.6 1.4H9.2a1.6 1.6 0 0 1-1.6-1.4z" ${F}/><path d="M5.5 6.5h13l-1.6 13.1a1.6 1.6 0 0 1-1.6 1.4H8.7a1.6 1.6 0 0 1-1.6-1.4zM12.5 6.5l2-4h3"/><circle cx="16.8" cy="6.5" r="2.4"/>`,
    'bed': `<path d="M3 13h18v4H3z" ${F}/><path d="M3 5.5v14M21 13v6.5M3 17h18M3 13h18v4"/><path d="M5.5 13v-1.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2V13"/>`,
    'heart': `<path d="M12 20s-7.5-4.4-7.5-10A4.5 4.5 0 0 1 12 7.1 4.5 4.5 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z" ${F}/><path d="M12 20s-7.5-4.4-7.5-10A4.5 4.5 0 0 1 12 7.1 4.5 4.5 0 0 1 19.5 10c0 5.6-7.5 10-7.5 10z"/>`,
    'shield': `<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6z" ${F}/><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8 7.5 9.5 4.3-1.5 7.5-4.9 7.5-9.5V6zM8.8 12l2.2 2.2 4.2-4.4"/>`,
    'phone': `<rect x="6.5" y="2.5" width="11" height="19" rx="2.8" ${F}/><rect x="6.5" y="2.5" width="11" height="19" rx="2.8"/><path d="M10.5 18.5h3"/>`,
    'palette': `<path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.9-1.7h2.2a3.6 3.6 0 0 0 3.6-3.6c0-4.2-3.8-7.4-8.5-7.4z" ${F}/><path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-1 .8-1.7 1.9-1.7h2.2a3.6 3.6 0 0 0 3.6-3.6c0-4.2-3.8-7.4-8.5-7.4z"/><circle cx="7.8" cy="11" r="1.2" ${FS}/><circle cx="10.5" cy="7.5" r="1.2" ${FS}/><circle cx="15" cy="7.8" r="1.2" ${FS}/>`,
    'home': `<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z" ${F}/><path d="M3 11.3 12 4l9 7.3M5 9.8V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19V9.8M10 20.5v-5h4v5"/>`,
    'user': `<circle cx="12" cy="8" r="4" ${F}/><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>`,
    'clock': `<circle cx="12" cy="12" r="9" ${F}/><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>`,
    'check': `<path d="M5 12.5l4.5 4.5L19 7.5"/>`,
    'close': `<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>`,
    'plus': `<path d="M12 5v14M5 12h14"/>`,
    'minus': `<path d="M5 12h14"/>`,
    'undo': `<path d="M8.5 5 4 9.5 8.5 14"/><path d="M4 9.5h10a5.5 5.5 0 0 1 0 11h-3"/>`,
    'edit': `<path d="M4 20h4L19 9l-4-4L4 16z" ${F}/><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>`,
    'trash': `<path d="M6.5 7.5h11l-.8 12a1.6 1.6 0 0 1-1.6 1.5H8.9a1.6 1.6 0 0 1-1.6-1.5z" ${F}/><path d="M4.5 7.5h15M9.5 7.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2.5M6.5 7.5l.8 12a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.8-12M10 11v6M14 11v6"/>`,
    'share': `<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="M8.7 10.7l6.6-3.9M8.7 13.3l6.6 3.9"/>`,
    'download': `<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 16v2.5A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2V16"/>`,
    'upload': `<path d="M12 14.5v-11M7.5 8 12 3.5 16.5 8M4.5 16v2.5A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2V16"/>`,
    'info': `<circle cx="12" cy="12" r="9" ${F}/><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6h.01"/>`,
    'bell': `<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z" ${F}/><path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 21h4"/>`,
    'pdf': `<path d="M6 2.5h8l5 5v12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1-1.5z" ${F}/><path d="M6.5 2.5H14l5 5v12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1.5-1.5zM14 2.5V7.5h5M8.5 13h7M8.5 16.5h5"/>`,
    'install': `<rect x="6.5" y="2.5" width="11" height="19" rx="2.8" ${F}/><rect x="6.5" y="2.5" width="11" height="19" rx="2.8"/><path d="M12 7v7M9.2 11.3 12 14l2.8-2.7"/>`,
    'dots': `<circle cx="12" cy="5.5" r="1.6" ${FS}/><circle cx="12" cy="12" r="1.6" ${FS}/><circle cx="12" cy="18.5" r="1.6" ${FS}/>`,
    'chevron-left': `<path d="M14.5 5.5 8 12l6.5 6.5"/>`,
    'chevron-right': `<path d="M9.5 5.5 16 12l-6.5 6.5"/>`,
    'chevron-down': `<path d="M5.5 9.5 12 16l6.5-6.5"/>`,
    'volume': `<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" ${F}/><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>`,
    'vibrate': `<rect x="7.5" y="3.5" width="9" height="17" rx="2.5" ${F}/><rect x="7.5" y="3.5" width="9" height="17" rx="2.5"/><path d="M4.5 8.5v7M19.5 8.5v7M2 10.5v3M22 10.5v3"/>`,
    'image': `<rect x="3.5" y="4.5" width="17" height="15" rx="3" ${F}/><rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="M4 17.5l4.5-4 3 2.5 3.5-3.5 5 4.5"/>`
  };
  // Aliase (falls Kolleg:innen andere Namen nutzen)
  const ALIAS = { settings: 'gear', cog: 'gear', soccer: 'ball', football: 'ball', training: 'ball', wc: 'toilet', photo: 'camera',
    stats: 'chart', report: 'chart', reports: 'chart', award: 'trophy', badge: 'medal', water: 'drop', tea: 'cup', x: 'close',
    'half-glass': 'glass-half', 'glass_half': 'glass-half', night: 'moon', streak: 'flame', time: 'clock', delete: 'trash',
    back: 'chevron-left', next: 'chevron-right', more: 'dots', saft: 'juice', milch: 'milk', wasser: 'drop', schorle: 'sparkle', sonstiges: 'cup' };

  function icon(name, opts) {
    const o = typeof opts === 'string' ? { cls: opts } : (opts || {});
    const key = ICONS[name] ? name : ALIAS[name];
    const inner = ICONS[key] || ICONS['drop'];
    const cls = 'e-ico' + (o.cls ? ' ' + o.cls : '') + ' e-ico-' + (key || 'drop');
    const size = o.size ? ` width="${o.size}" height="${o.size}"` : '';
    return `<svg class="${cls}"${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${o.stroke || 2}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;
  }
  icon.names = () => Object.keys(ICONS);
  icon.has = (n) => !!(ICONS[n] || ALIAS[n]);

  /* Maskottchen „Tropfi“ – moderner Tropfen mit Gesicht. mood: 'happy' | 'wink' | 'cool' | 'sleepy' | 'wow' */
  let mascotN = 0;
  function mascot(mood, opts) {
    const o = opts || {};
    const id = 'em' + (++mascotN);
    const eyes = {
      happy: `<ellipse class="e-mascot__eye" cx="40" cy="74" rx="5" ry="6.5" fill="#10233A"/><ellipse class="e-mascot__eye" cx="64" cy="74" rx="5" ry="6.5" fill="#10233A"/><circle cx="42" cy="71.5" r="1.8" fill="#fff"/><circle cx="66" cy="71.5" r="1.8" fill="#fff"/>`,
      wink: `<ellipse class="e-mascot__eye" cx="40" cy="74" rx="5" ry="6.5" fill="#10233A"/><circle cx="42" cy="71.5" r="1.8" fill="#fff"/><path d="M58 75q6-6 12 0" stroke="#10233A" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      cool: `<path d="M27 68h50l-2 7a8 8 0 0 1-8 6h-6a7 7 0 0 1-7-6l-1-2h-2l-1 2a7 7 0 0 1-7 6h-6a8 8 0 0 1-8-6z" fill="#10233A"/><path d="M33 70h8" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".55"/>`,
      sleepy: `<path d="M34 75q6 5 12 0M58 75q6 5 12 0" stroke="#10233A" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      wow: `<circle class="e-mascot__eye" cx="40" cy="73" r="6.5" fill="#10233A"/><circle class="e-mascot__eye" cx="64" cy="73" r="6.5" fill="#10233A"/><circle cx="42.5" cy="70.5" r="2" fill="#fff"/><circle cx="66.5" cy="70.5" r="2" fill="#fff"/>`
    }[mood || 'happy'] || '';
    const mouth = mood === 'wow' ? `<ellipse cx="52" cy="90" rx="5" ry="6" fill="#10233A"/>`
      : mood === 'sleepy' ? `<path d="M47 90q5 3 10 0" stroke="#10233A" stroke-width="4" fill="none" stroke-linecap="round"/>`
      : `<path d="M43 87q9 9 18 0" stroke="#10233A" stroke-width="4.2" fill="none" stroke-linecap="round"/>`;
    const fill = o.white ? `url(#${id}w)` : `url(#${id}g)`;
    return `<svg class="e-mascot${o.float ? ' e-mascot--float' : ''}${o.cls ? ' ' + o.cls : ''}" viewBox="0 0 104 120" aria-hidden="true">
      <defs>
        <linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--c-water, #22B8D9)"/><stop offset="1" stop-color="var(--c-water-2, #3D7BF2)"/></linearGradient>
        <linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#E9F3FF"/></linearGradient>
      </defs>
      <ellipse cx="52" cy="114" rx="26" ry="4" fill="#0B2140" opacity=".12"/>
      <path d="M52 4C68 24 92 46 92 72a40 40 0 0 1-80 0C12 46 36 24 52 4z" fill="${fill}"/>
      <path d="M30 56c3-9 9-17 15-24" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity="${o.white ? '.9' : '.45'}"/>
      <circle cx="31" cy="68" r="3.4" fill="#fff" opacity="${o.white ? '0' : '.5'}"/>
      ${eyes}
      <ellipse cx="31" cy="85" rx="6" ry="3.6" fill="#FF8FB1" opacity=".55"/><ellipse cx="73" cy="85" rx="6" ry="3.6" fill="#FF8FB1" opacity=".55"/>
      ${mouth}
    </svg>`;
  }

  /* =================================================================
     HAPTIK & SOUND
     ================================================================= */
  // Chrome blockiert vibrate()/AudioContext vor der ersten Nutzergeste (Konsolenfehler) → erst danach.
  const gestured = () => !navigator.userActivation || navigator.userActivation.hasBeenActive;
  function haptic(pattern) {
    if (pattern === undefined) pattern = 15;
    if (settings().haptics === false || !gestured()) return false;
    try { if (navigator.vibrate) return navigator.vibrate(pattern); } catch (e) { /* ignorieren */ }
    return false;
  }

  let actx = null;
  function audio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!actx) { try { actx = new AC(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }
  function tone(ctx, { type = 'sine', f0, f1, t = 0, dur = 0.15, vol = 0.18, attack = 0.008 }) {
    const now = ctx.currentTime + t;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    if (f1) osc.frequency.exponentialRampToValueAtTime(f1, now + dur);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(now); osc.stop(now + dur + 0.02);
  }
  const SOUNDS = {
    plop(ctx) { tone(ctx, { f0: 880, f1: 240, dur: 0.12, vol: 0.22 }); tone(ctx, { type: 'triangle', f0: 1500, f1: 900, t: 0.02, dur: 0.06, vol: 0.05 }); },
    yay(ctx) { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ctx, { type: 'triangle', f0: f, t: i * 0.085, dur: i === 3 ? 0.42 : 0.16, vol: 0.14 })); },
    tick(ctx) { tone(ctx, { type: 'square', f0: 1200, dur: 0.03, vol: 0.03 }); },
    soft(ctx) { tone(ctx, { f0: 520, f1: 660, dur: 0.18, vol: 0.12 }); }
  };
  function sound(name) {
    if (settings().sound === false || !gestured()) return false;
    const fn = SOUNDS[name || 'plop']; if (!fn) return false;
    const ctx = audio(); if (!ctx) return false;
    try { fn(ctx); return true; } catch (e) { return false; }
  }

  /* =================================================================
     TOAST
     ================================================================= */
  let activeToast = null;
  function toast(msg, opts) {
    const o = opts || {};
    const duration = o.duration == null ? 3500 : o.duration;
    const host = layer('layer-toast', 'e-toast-layer');
    if (activeToast) activeToast.close(true);

    const el = document.createElement('div');
    el.className = 'e-toast';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    el.innerHTML = `<span class="e-toast__icon">${icon(o.icon || 'check', { stroke: 2.6 })}</span><div class="e-toast__msg"></div><div class="e-toast__actions"></div>` +
      (duration > 0 ? `<span class="e-toast__bar"><i style="animation-duration:${duration}ms"></i></span>` : '');
    el.querySelector('.e-toast__msg').textContent = msg == null ? '' : String(msg);
    const acts = el.querySelector('.e-toast__actions');
    let timer = null, closed = false;
    const handle = {
      el,
      close(instant) {
        if (closed) return; closed = true; clearTimeout(timer);
        if (activeToast === handle) { activeToast = null; if (Emly.bus) Emly.bus.emit('ui:toast-closed', {}); }
        if (instant || reducedMotion()) { el.remove(); return; }
        el.classList.remove('is-in'); el.classList.add('is-out');
        setTimeout(() => el.remove(), 220);
      }
    };
    (o.actions || []).forEach(a => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'e-toast__btn'; b.textContent = a.label;
      b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        haptic(10);
        handle.close();
        try { a.onClick && a.onClick(ev); } catch (e) { console.error('[ui.toast action]', e); }
      });
      acts.appendChild(b);
    });
    if (!o.actions || !o.actions.length) acts.remove();

    // Wischen zum Schließen (seitlich)
    let sx = null;
    el.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchmove', e => {
      if (sx == null) return; const dx = e.touches[0].clientX - sx;
      el.style.transform = `translateX(${dx}px)`; el.style.opacity = String(1 - Math.min(1, Math.abs(dx) / 220));
    }, { passive: true });
    el.addEventListener('touchend', e => {
      const dx = (e.changedTouches[0].clientX - (sx == null ? 0 : sx)); sx = null;
      if (Math.abs(dx) > 90) handle.close(true); else { el.style.transform = ''; el.style.opacity = ''; }
    });

    host.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-in')));
    if (duration > 0) timer = setTimeout(() => handle.close(), duration);
    activeToast = handle;
    return handle;
  }

  /* =================================================================
     SHEET (Bottom-Sheet, Stapel, Swipe-down, Backdrop, Android-Back)
     ================================================================= */
  const stack = [];
  let ignorePops = 0;
  let sheetSeq = 0;

  window.addEventListener('popstate', () => {
    if (ignorePops > 0) ignorePops--;
    else { const top = stack[stack.length - 1]; if (top) top._close('back', true); }
    // Auf einem „verwaisten“ Sheet-Eintrag gelandet (Sheet wurde nicht als oberstes geschlossen)? → überspringen
    const s = history.state;
    if (s && s.emlySheet && !stack.some(h => h.id === s.emlySheet)) { ignorePops++; history.back(); }
  });

  function sheet(opts) {
    const o = opts || {};
    const host = layer('layer-sheet', 'e-layer');
    const sid = 'sheet-' + (++sheetSeq);
    const prevFocus = document.activeElement;

    const wrap = document.createElement('div');
    wrap.className = 'e-sheet-wrap';
    wrap.innerHTML = `<div class="e-sheet__backdrop"></div>
      <div class="e-sheet" role="dialog" aria-modal="true" tabindex="-1" ${o.title ? `aria-labelledby="${sid}-t"` : 'aria-label="Dialog"'}>
        <div class="e-sheet__grip"><div class="e-sheet__handle"></div></div>
        ${o.title ? `<div class="e-sheet__head"><h2 class="e-sheet__title" id="${sid}-t"></h2><button type="button" class="e-sheet__close" aria-label="Schließen">${icon('close')}</button></div>` : ''}
        <div class="e-sheet__body"></div>
        <div class="e-sheet__actions"></div>
      </div>`;
    const sh = wrap.querySelector('.e-sheet');
    const bodyEl = wrap.querySelector('.e-sheet__body');
    const actsEl = wrap.querySelector('.e-sheet__actions');
    if (o.title) wrap.querySelector('.e-sheet__title').textContent = o.title;
    const bodyNode = toNode(o.body);
    if (bodyNode) bodyEl.appendChild(bodyNode); else bodyEl.remove();
    if (o.className) sh.classList.add(...String(o.className).split(/\s+/));

    let closed = false;
    const handle = {
      el: sh, body: bodyEl, id: sid,
      close(reason) { handle._close(reason || 'api', false); },
      _close(reason, fromPop) {
        if (closed) return; closed = true;
        const i = stack.indexOf(handle); if (i >= 0) stack.splice(i, 1);
        if (!fromPop && history.state && history.state.emlySheet === sid) { ignorePops++; history.back(); }
        wrap.classList.remove('is-open');
        if (!stack.length) setInert(false);   // vor dem Fokus-Zurücksetzen, sonst ist das Ziel noch inert
        const done = () => { wrap.remove(); if (!stack.length) document.documentElement.style.overflow = ''; };
        if (reducedMotion()) done(); else setTimeout(done, 320);
        try { prevFocus && prevFocus.focus && document.contains(prevFocus) && prevFocus.focus({ preventScroll: true }); } catch (e) { /* egal */ }
        try { o.onClose && o.onClose(reason); } catch (e) { console.error('[ui.sheet onClose]', e); }
        syncToastPos();
        if (Emly.bus) Emly.bus.emit('ui:sheet-closed', { id: sid, reason, open: stack.length });
      }
    };

    const acts = o.actions || [];
    acts.forEach(a => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'e-btn ' + (a.primary ? 'e-btn--primary' : a.danger ? 'e-btn--danger-solid' : 'e-btn--soft') + (a.className ? ' ' + a.className : '');
      if (a.icon) b.innerHTML = icon(a.icon) + '<span></span>'; else b.innerHTML = '<span></span>';
      b.querySelector('span').textContent = a.label;
      b.addEventListener('click', async (ev) => {
        haptic(10);
        let res;
        try { res = a.onClick ? a.onClick(ev, handle) : undefined; if (res && typeof res.then === 'function') res = await res; }
        catch (e) { console.error('[ui.sheet action]', e); }
        if (res !== false) handle._close('action', false);
      });
      actsEl.appendChild(b);
    });
    if (!acts.length) actsEl.remove();
    else if (acts.length > 2 || o.stackActions) actsEl.classList.add('e-sheet__actions--stack');

    // Schließen: Backdrop & X
    wrap.querySelector('.e-sheet__backdrop').addEventListener('click', () => handle._close('backdrop', false));
    const x = wrap.querySelector('.e-sheet__close'); if (x) x.addEventListener('click', () => handle._close('close', false));
    sh.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); handle._close('escape', false); } });

    // Swipe-down: Griff/Kopf immer, Body nur wenn ganz oben gescrollt
    let startY = null, lastY = 0, lastT = 0, vel = 0, dragging = false, fromBody = false;
    const onStart = (e) => {
      const t = e.touches ? e.touches[0] : e;
      fromBody = bodyEl.contains(e.target);
      if (fromBody && bodyEl.scrollTop > 0) return;
      startY = t.clientY; lastY = t.clientY; lastT = performance.now(); vel = 0; dragging = false;
    };
    const onMove = (e) => {
      if (startY == null) return;
      const t = e.touches ? e.touches[0] : e;
      const dy = t.clientY - startY;
      if (!dragging) {
        if (dy < 6) { if (dy < -4 && fromBody) startY = null; return; }
        dragging = true; wrap.classList.add('is-dragging');
      }
      const now = performance.now(); vel = (t.clientY - lastY) / Math.max(1, now - lastT); lastY = t.clientY; lastT = now;
      sh.style.transform = `translateY(${Math.max(0, dy)}px)`;
      if (e.cancelable) e.preventDefault();
    };
    const onEnd = () => {
      if (startY == null) return;
      const dy = lastY - startY; startY = null;
      if (!dragging) return;
      dragging = false; wrap.classList.remove('is-dragging');
      if (dy > Math.min(140, sh.offsetHeight * 0.3) || vel > 0.6) { sh.style.transform = 'translateY(110%)'; handle._close('swipe', false); }
      else sh.style.transform = '';
    };
    sh.addEventListener('touchstart', onStart, { passive: true });
    sh.addEventListener('touchmove', onMove, { passive: false });
    sh.addEventListener('touchend', onEnd); sh.addEventListener('touchcancel', onEnd);

    host.appendChild(wrap);
    stack.push(handle);
    setInert(true);
    syncToastPos();
    document.documentElement.style.overflow = 'hidden';
    try { history.pushState(Object.assign({}, history.state || {}, { emlySheet: sid }), ''); } catch (e) { /* file:// o. ä. */ }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      wrap.classList.add('is-open');
      try { sh.focus({ preventScroll: true }); } catch (e) { /* egal */ }
    }));
    return handle;
  }

  /* Hintergrund sperren, solange ein Sheet offen ist (Screenreader/Fokus landen nicht in #app) */
  function setInert(on) {
    const app = document.getElementById('app');
    if (!app) return;
    app.inert = !!on;   // kein aria-hidden: Chrome warnt, wenn darin noch der Fokus liegt
  }
  function syncToastPos() { const t = document.getElementById('layer-toast'); if (t) t.classList.toggle('is-top', stack.length > 0); }
  function isToastOpen() { return !!activeToast; }

  function closeAllSheets() { stack.slice().reverse().forEach(s => s.close('closeAll')); }
  function isSheetOpen() { return stack.length > 0; }

  /* =================================================================
     CONFIRM → Promise<boolean>
     ================================================================= */
  function confirm(title, text, okLabel, opts) {
    const o = opts || {};
    return new Promise((resolve) => {
      let result = false;
      const body = document.createElement('div');
      if (text) { const p = document.createElement('p'); p.textContent = text; body.appendChild(p); }
      sheet({
        title: title || 'Sicher?',
        body: text ? body : null,
        actions: [
          { label: o.cancelLabel || 'Abbrechen', onClick: () => { result = false; } },
          { label: okLabel || 'OK', primary: !o.danger, danger: !!o.danger, onClick: () => { result = true; } }
        ],
        onClose: () => resolve(result)
      });
    });
  }

  /* =================================================================
     CONFETTI (Canvas, leicht, ~1,8 s)
     ================================================================= */
  function confetti(opts) {
    const o = opts || {};
    if (reducedMotion()) return;
    const cv = document.createElement('canvas');
    cv.className = 'e-confetti';
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
    const cs = getComputedStyle(document.documentElement);
    const theme = ['--c-primary', '--c-primary-2', '--c-accent'].map(v => cs.getPropertyValue(v).trim()).filter(Boolean);
    const colors = theme.concat(['#FFFFFF', '#FFD35C', '#7FE3F2']);
    const N = o.count || Math.round(Math.min(150, W / 3));
    const parts = [];
    for (let i = 0; i < N; i++) {
      const fromLeft = i % 2 === 0;
      parts.push({
        x: fromLeft ? -10 : W + 10, y: H * (0.55 + Math.random() * 0.25),
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 7), vy: -(9 + Math.random() * 9),
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 6, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .35,
        c: colors[i % colors.length], shape: i % 5 === 0 ? 'drop' : i % 3 === 0 ? 'circle' : 'rect', wob: Math.random() * 6
      });
    }
    const start = performance.now(), life = o.duration || 1900;
    function frame(now) {
      const t = now - start;
      ctx.clearRect(0, 0, W, H);
      const fade = t > life - 450 ? Math.max(0, (life - t) / 450) : 1;
      for (const p of parts) {
        p.vy += 0.32; p.vx *= 0.985; p.vy *= 0.99;
        p.x += p.vx + Math.sin((t / 160) + p.wob) * 0.6; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.globalAlpha = fade; ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c;
        if (p.shape === 'circle') { ctx.beginPath(); ctx.arc(0, 0, p.w / 2.4, 0, Math.PI * 2); ctx.fill(); }
        else if (p.shape === 'drop') { ctx.beginPath(); ctx.moveTo(0, -p.w * .8); ctx.quadraticCurveTo(p.w * .6, 0, 0, p.w * .5); ctx.quadraticCurveTo(-p.w * .6, 0, 0, -p.w * .8); ctx.fill(); }
        else { ctx.scale(1, Math.cos(t / 120 + p.wob)); ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        ctx.restore();
      }
      if (t < life) requestAnimationFrame(frame); else cv.remove();
    }
    requestAnimationFrame(frame);
  }

  /* Kleiner Ripple-Helfer für .e-tile (setzt --rx/--ry) – optional */
  document.addEventListener('pointerdown', (e) => {
    const t = e.target && e.target.closest && e.target.closest('.e-tile');
    if (!t) return;
    const r = t.getBoundingClientRect();
    t.style.setProperty('--rx', ((e.clientX - r.left) / r.width * 100) + '%');
    t.style.setProperty('--ry', ((e.clientY - r.top) / r.height * 100) + '%');
  }, { passive: true });

  Emly.ui = { toast, sheet, confirm, confetti, haptic, sound, icon, mascot, closeAllSheets, isSheetOpen, isToastOpen };
})();
