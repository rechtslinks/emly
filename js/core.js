/* Emly – core.js (vom Product Owner vorgegeben, NICHT ändern ohne Absprache)
 * Globaler Namespace, Event-Bus, Screen-Registry, Datums-/Format-Helfer.
 * Alle anderen Module hängen sich an window.Emly an (klassische Scripts, kein Build-Schritt).
 */
(function () {
  'use strict';
  const Emly = (window.Emly = window.Emly || {});
  Emly.VERSION = '1.0.4';   // gleich halten mit CACHE in sw.js

  /* ---------- Event-Bus ---------- */
  const listeners = {};
  Emly.bus = {
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => Emly.bus.off(evt, fn); },
    off(evt, fn) { listeners[evt] = (listeners[evt] || []).filter(f => f !== fn); },
    emit(evt, payload) {
      (listeners[evt] || []).slice().forEach(fn => {
        try { fn(payload); } catch (e) { console.error('[bus]', evt, e); }
      });
    }
  };

  /* ---------- Screen-Registry ----------
   * Emly.screens.register(id, { title, icon, nav:true|false, order, mount(el), unmount?(), refresh?() })
   * app.js rendert die Bottom-Navigation aus allen nav:true Screens (sortiert nach order).
   */
  const screens = {};
  Emly.screens = {
    register(id, def) { screens[id] = Object.assign({ id, nav: true, order: 50 }, def); },
    get(id) { return screens[id]; },
    all() { return Object.values(screens).sort((a, b) => a.order - b.order); }
  };

  /* ---------- Datum & Zeit ----------
   * dayKey: 'YYYY-MM-DD' in lokaler Zeit. Einträge vor settings.dayStartHour (Standard 4 Uhr)
   * zählen zum Vortag (die Nacht gehört zum Abend davor).
   */
  const pad = n => String(n).padStart(2, '0');
  const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  const WD_LONG = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  Emly.util = {
    pad,
    /** Kalender-Key eines Date-Objekts (ohne Tagesgrenzen-Logik) */
    calKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); },
    /** Key -> Date (lokal 12:00, um DST-Probleme zu vermeiden) */
    keyToDate(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d, 12, 0, 0); },
    addDays(key, n) { const d = Emly.util.keyToDate(key); d.setDate(d.getDate() + n); return Emly.util.calKey(d); },
    /** Liste aller Keys von..bis (inklusive) */
    range(fromKey, toKey) {
      const out = []; let k = fromKey;
      while (k <= toKey) { out.push(k); k = Emly.util.addDays(k, 1); }
      return out;
    },
    weekday(key) { return WD[Emly.util.keyToDate(key).getDay()]; },
    weekdayLong(key) { return WD_LONG[Emly.util.keyToDate(key).getDay()]; },
    fmtDate(key) { const d = Emly.util.keyToDate(key); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); },
    fmtDateShort(key) { const d = Emly.util.keyToDate(key); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.'; },
    monthName(m) { return MON[m]; },
    fmtTime(iso) { const d = new Date(iso); return pad(d.getHours()) + ':' + pad(d.getMinutes()); },
    fmtMl(ml) { return ml >= 1000 ? (Math.round(ml / 100) / 10).toLocaleString('de-DE') + ' l' : Math.round(ml) + ' ml'; },
    uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },
    clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },
    /** Tageszeit-Abschnitt eines Zeitpunkts – einheitlich für Heute, Berichte, PDF */
    daypart(iso) {
      const h = new Date(iso).getHours();
      if (h >= 4 && h < 9) return 'morgens';
      if (h >= 9 && h < 12) return 'vormittags';
      if (h >= 12 && h < 14) return 'mittags';
      if (h >= 14 && h < 18) return 'nachmittags';
      if (h >= 18 && h < 21) return 'abends';
      return 'spaet';
    },
    DAYPARTS: [
      { id: 'morgens', label: 'Morgens', short: 'Früh', range: '4–9 Uhr' },
      { id: 'vormittags', label: 'Vormittags', short: 'Vorm.', range: '9–12 Uhr' },
      { id: 'mittags', label: 'Mittags', short: 'Mittag', range: '12–14 Uhr' },
      { id: 'nachmittags', label: 'Nachmittags', short: 'Nachm.', range: '14–18 Uhr' },
      { id: 'abends', label: 'Abends', short: 'Abend', range: '18–21 Uhr' },
      { id: 'spaet', label: 'Spät / Nacht', short: 'Spät', range: 'ab 21 Uhr' }
    ],
    esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
    /** kleines DOM-Helferlein: h('div', {class:'x', onclick:fn}, 'text', childEl) */
    h(tag, attrs, ...children) {
      const el = document.createElement(tag);
      if (attrs) for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else el.setAttribute(k, v === true ? '' : v);
      }
      children.flat().forEach(c => { if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); });
      return el;
    }
  };
})();
