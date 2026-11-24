/* Emly – store.js (Dev A „Erfassung“, Lena)
 * Zustand in localStorage (Key 'emly.v1'), Fotos als JPEG-Blobs in IndexedDB (DB 'emly', Store 'photos').
 * Jede Mutation speichert sofort und emittet bus 'data:changed' {kind, ...}.
 *   kind: 'entry' (action add|update|remove, id) · 'day' (key) · 'settings' · 'game' · 'import' · 'reset' · 'external'
 * Robust: läuft ohne IndexedDB (Fotos dann aus) und ohne localStorage (dann nur im Speicher).
 */
(function () {
  'use strict';
  const Emly = (window.Emly = window.Emly || {});
  const U = Emly.util;

  const LS_KEY = 'emly.v1';
  const DB_NAME = 'emly';
  const DB_STORE = 'photos';
  const SCHEMA_VERSION = 1;

  const THEMES = ['lagune', 'beere', 'sunset', 'mint'];
  const DRINKS = ['wasser', 'schorle', 'tee', 'milch', 'saft', 'sonstiges'];
  const DEFAULT_UNITS = { half: 100, glass: 200, bottle: 500 };
  const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

  /* ---------------- Helfer ---------------- */
  const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
  const clone = v => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const nowISO = () => new Date().toISOString();
  function validISO(v) {
    if (typeof v !== 'string' && !(v instanceof Date) && typeof v !== 'number') return null;
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  function num(v, min, max, def) {
    const n = Number(v);
    if (!isFinite(n)) return def;
    return Math.round(U.clamp(n, min, max));
  }
  const bool = (v, def) => (typeof v === 'boolean' ? v : def);

  function emit(kind, extra) {
    if (Emly.bus) Emly.bus.emit('data:changed', Object.assign({ kind }, extra || {}));
  }

  /* ---------------- Defaults & Normalisierung (Migration) ---------------- */
  function defaults() {
    return {
      version: SCHEMA_VERSION,
      settings: {
        name: '', theme: 'lagune',
        units: Object.assign({}, DEFAULT_UNITS),
        goalBase: 1200, goalTraining: 1700,
        dayStartHour: 4,
        savePhotos: true, sound: true, haptics: true,
        onboarded: false, createdAt: nowISO()
      },
      entries: [],
      days: {},
      game: { seenBadges: [], lastLevel: 1, unlockedThemes: ['lagune'] }
    };
  }

  function normSettings(src, base) {
    const d = base || defaults().settings;
    const s = Object.assign({}, d, isObj(src) ? src : {}); // unbekannte Keys (z. B. von Mira) bleiben erhalten
    s.name = typeof s.name === 'string' && s.name.trim() ? s.name.trim().slice(0, 30) : d.name;
    s.theme = typeof s.theme === 'string' && s.theme ? s.theme : 'lagune';
    const units = Object.assign({}, DEFAULT_UNITS, isObj(d.units) ? d.units : {}, isObj(src && src.units) ? src.units : {});
    for (const k of Object.keys(units)) units[k] = num(units[k], 10, 3000, DEFAULT_UNITS[k] || 200);
    s.units = units;
    s.goalBase = num(s.goalBase, 200, 6000, 1200);
    s.goalTraining = num(s.goalTraining, 200, 8000, 1700);
    s.dayStartHour = num(s.dayStartHour, 0, 12, 4);
    s.savePhotos = bool(s.savePhotos, true);
    s.sound = bool(s.sound, true);
    s.haptics = bool(s.haptics, true);
    s.onboarded = bool(s.onboarded, false);
    s.createdAt = validISO(s.createdAt) || nowISO();
    return s;
  }

  function normEntry(e, units) {
    if (!isObj(e)) return null;
    const type = e.type === 'toilet' ? 'toilet' : e.type === 'drink' ? 'drink' : null;
    const ts = validISO(e.ts);
    if (!type || !ts) return null;
    const out = Object.assign({}, e, { id: typeof e.id === 'string' && e.id ? e.id : U.uid(), type, ts });
    if (type === 'drink') {
      const unit = typeof e.unit === 'string' && (e.unit === 'custom' || (units && units[e.unit] != null)) ? e.unit : (e.unit == null ? 'glass' : 'custom');
      const defMl = units && units[unit] != null ? units[unit] : 200;
      out.unit = unit;
      out.ml = num(e.ml == null ? defMl : e.ml, 1, 5000, defMl);
      out.drink = DRINKS.indexOf(e.drink) >= 0 ? e.drink : (e.drink == null ? 'wasser' : 'sonstiges');
      if (typeof e.photoId === 'string' && e.photoId) out.photoId = e.photoId; else delete out.photoId;
    } else {
      delete out.ml; delete out.unit; delete out.drink; delete out.photoId;
    }
    return out;
  }

  function normEntries(arr, units) {
    const seen = new Set();
    const out = [];
    (Array.isArray(arr) ? arr : []).forEach(raw => {
      const e = normEntry(raw, units);
      if (!e) return;
      if (seen.has(e.id)) e.id = U.uid();
      seen.add(e.id);
      out.push(e);
    });
    return out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0));
  }

  function normNight(nb) {
    if (!isObj(nb)) return null;
    const t = Number(nb.toilet);
    if (!isFinite(t)) return null;
    return {
      toilet: t >= 2 ? 2 : t >= 1 ? 1 : 0,
      bed: nb.bed === 'trocken' || nb.bed === 'nass' ? nb.bed : null,
      answeredAt: validISO(nb.answeredAt) || nowISO()
    };
  }

  function normDay(d) {
    const src = isObj(d) ? d : {};
    const out = Object.assign({}, src);
    out.training = src.training === true ? true : src.training === false ? false : null;
    out.nightBefore = normNight(src.nightBefore);
    if (typeof src.note === 'string' && src.note.trim()) out.note = src.note.slice(0, 500); else delete out.note;
    return out;
  }
  const dayIsEmpty = d => d.training === null && d.nightBefore === null && !d.note &&
    Object.keys(d).every(k => k === 'training' || k === 'nightBefore');

  function normDays(days) {
    const out = {};
    if (isObj(days)) for (const k of Object.keys(days)) {
      if (!KEY_RE.test(k)) continue;
      const d = normDay(days[k]);
      if (!dayIsEmpty(d)) out[k] = d;
    }
    return out;
  }

  function normGame(g) {
    const src = isObj(g) ? g : {};
    const out = Object.assign({}, src);
    out.seenBadges = Array.isArray(src.seenBadges) ? src.seenBadges.filter(x => typeof x === 'string') : [];
    out.lastLevel = num(src.lastLevel, 1, 999, 1);
    const th = Array.isArray(src.unlockedThemes) ? src.unlockedThemes.filter(x => typeof x === 'string') : [];
    if (th.indexOf('lagune') < 0) th.unshift('lagune');
    out.unlockedThemes = th;
    return out;
  }

  /** Bringt beliebige (alte/kaputte/importierte) Daten in das aktuelle Schema. */
  function normalize(raw) {
    const src = isObj(raw) ? raw : {};
    const settings = normSettings(src.settings);
    return {
      version: SCHEMA_VERSION,
      settings,
      entries: normEntries(src.entries, settings.units),
      days: normDays(src.days),
      game: normGame(src.game)
    };
  }

  /* ---------------- Persistenz localStorage ---------------- */
  let lsOK = true;
  function lsGet() {
    try { return window.localStorage.getItem(LS_KEY); } catch (e) { lsOK = false; return null; }
  }
  let loadedRaw;  // zuletzt geladener Rohwert – init() lädt nicht doppelt (sonst doppelte .corrupt-Sicherung)
  let corruptDetected = false;  // Abnahme: wird in init() als store:error {kind:'corrupt'} gemeldet
  function load() {
    const raw = lsGet();
    loadedRaw = raw;
    corruptDetected = false;
    if (!raw) return { state: defaults(), fresh: true };
    try {
      return { state: normalize(JSON.parse(raw)), fresh: false };
    } catch (e) {
      // Kaputte Daten nicht verlieren: Rohdaten sichern, frisch starten.
      console.warn('[store] Daten nicht lesbar – Sicherung angelegt', e);
      try { window.localStorage.setItem(LS_KEY + '.corrupt-' + Date.now(), raw); } catch (_) { /* egal */ }
      corruptDetected = true;
      return { state: defaults(), fresh: true };
    }
  }
  function save() {
    if (!lsOK) return false;
    try {
      window.localStorage.setItem(LS_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('[store] Speichern fehlgeschlagen', e);
      if (Emly.bus) Emly.bus.emit('store:error', { error: e, kind: 'save' });
      return false;
    }
  }

  let state = load().state;

  /* ---------------- Tages-Index (Cache) ---------------- */
  let byDay = null; // Map dayKey -> entries[] (sortiert)
  const invalidate = () => { byDay = null; };
  function index() {
    if (byDay) return byDay;
    byDay = new Map();
    for (const e of state.entries) {
      const k = dayKeyOf(e.ts);
      if (!k) continue;
      let arr = byDay.get(k);
      if (!arr) byDay.set(k, (arr = []));
      arr.push(e);
    }
    return byDay;
  }
  function sortEntries() { state.entries.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0)); }

  /* ---------------- Datum ---------------- */
  function dayKeyOf(isoOrDate) {
    const d = isoOrDate instanceof Date ? new Date(isoOrDate.getTime()) : new Date(isoOrDate);
    if (isNaN(d.getTime())) return null;
    if (d.getHours() < state.settings.dayStartHour) {
      d.setHours(12, 0, 0, 0); // DST-sicher
      d.setDate(d.getDate() - 1);
    }
    return U.calKey(d);
  }
  const todayKey = () => dayKeyOf(new Date());

  /* ---------------- IndexedDB (Fotos) ---------------- */
  let db = null;
  function openDB() {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const timer = setTimeout(() => { console.warn('[store] IndexedDB antwortet nicht – Fotos aus'); finish(null); }, 2500);
      try {
        if (!window.indexedDB) { clearTimeout(timer); return finish(null); }
        const req = window.indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const d = req.result;
          if (!d.objectStoreNames.contains(DB_STORE)) d.createObjectStore(DB_STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => {
          clearTimeout(timer);
          const d = req.result;
          d.onversionchange = () => { try { d.close(); } catch (_) { /* egal */ } db = null; };
          if (done) { try { d.close(); } catch (_) { /* egal */ } return; }
          finish(d);
        };
        req.onerror = () => { clearTimeout(timer); console.warn('[store] IndexedDB nicht verfügbar', req.error); finish(null); };
        req.onblocked = () => { /* Timeout greift */ };
      } catch (e) {
        clearTimeout(timer); console.warn('[store] IndexedDB Fehler', e); finish(null);
      }
    });
  }
  function idb(mode, fn) {
    return new Promise(resolve => {
      if (!db) return resolve(null);
      try {
        const tx = db.transaction(DB_STORE, mode);
        const os = tx.objectStore(DB_STORE);
        let result = null;
        const req = fn(os);
        if (req) req.onsuccess = () => { result = req.result; };
        tx.oncomplete = () => resolve(result === undefined ? null : result);
        tx.onerror = tx.onabort = () => { console.warn('[store] IndexedDB-Transaktion fehlgeschlagen', tx.error); resolve(null); };
      } catch (e) {
        console.warn('[store] IndexedDB Fehler', e);
        resolve(null);
      }
    });
  }
  /** Entfernt Fotos, auf die kein Eintrag mehr zeigt (z. B. nach Absturz/Reset). */
  async function gcPhotos() {
    const keys = await idb('readonly', os => (os.getAllKeys ? os.getAllKeys() : null));
    if (!Array.isArray(keys) || !keys.length) return;
    const used = new Set(state.entries.map(e => e.photoId).filter(Boolean));
    const orphans = keys.filter(k => !used.has(k));
    if (orphans.length) await idb('readwrite', os => { orphans.forEach(k => os.delete(k)); return null; });
  }

  /* ---------------- Öffentliche API ---------------- */
  let initPromise = null;

  const store = {
    init() {
      if (initPromise) return initPromise;
      initPromise = (async () => {
        if (lsGet() !== loadedRaw) { state = load().state; invalidate(); }
        // Name kommt nur über den privaten Installationslink (?name=…), nie aus dem öffentlichen Code
        try {
          const qn = new URLSearchParams(location.search).get('name');
          if (qn && qn.trim() && !state.settings.name) state.settings.name = qn.trim().slice(0, 30);
          if (qn && history.replaceState) history.replaceState(null, '', location.pathname + location.hash);
        } catch (e) { /* ignorieren */ }
        save(); // createdAt festschreiben bzw. migrierte Form zurückschreiben
        // Probleme melden (app.js zeigt einen freundlichen Hinweis)
        if (Emly.bus) {
          if (!lsOK) Emly.bus.emit('store:error', { kind: 'nostorage' });
          else if (corruptDetected) Emly.bus.emit('store:error', { kind: 'corrupt' });
        }
        try {
          if (navigator.storage && navigator.storage.persist) {
            navigator.storage.persist().catch(() => { /* egal */ });
          }
        } catch (_) { /* egal */ }
        db = await openDB();
        if (db) gcPhotos().catch(() => { /* egal */ });
        return store;
      })();
      return initPromise;
    },

    /** Schnappschuss (Kopie) – Änderungen nur über die Store-Funktionen. */
    getState() { return clone(state); },
    getSettings() { return clone(state.settings); },
    updateSettings(patch) {
      if (!isObj(patch)) return store.getSettings();
      const oldStart = state.settings.dayStartHour;
      const merged = Object.assign({}, state.settings, patch);
      if (isObj(patch.units)) merged.units = Object.assign({}, state.settings.units, patch.units);
      state.settings = normSettings(merged, state.settings);
      if (state.settings.dayStartHour !== oldStart) invalidate();
      save();
      emit('settings', { keys: Object.keys(patch) });
      return store.getSettings();
    },

    /* --- Einträge --- */
    addEntry(data) {
      const src = isObj(data) ? data : {};
      if (src.type !== 'drink' && src.type !== 'toilet') throw new Error('addEntry: type muss "drink" oder "toilet" sein');
      const raw = Object.assign({}, src, { ts: src.ts == null ? nowISO() : src.ts });
      if (raw.id != null && state.entries.some(e => e.id === raw.id)) delete raw.id; // id nur für „Wiederherstellen“
      if (raw.ts != null && !validISO(raw.ts)) throw new Error('addEntry: ungültiger Zeitpunkt');
      const e = normEntry(raw, state.settings.units);
      state.entries.push(e);
      sortEntries();
      invalidate();
      save();
      emit('entry', { action: 'add', id: e.id });
      return clone(e);
    },
    updateEntry(id, patch) {
      const i = state.entries.findIndex(e => e.id === id);
      if (i < 0 || !isObj(patch)) return null;
      const old = state.entries[i];
      const p = Object.assign({}, patch);
      delete p.id; delete p.type;
      if (p.ts != null && !validISO(p.ts)) throw new Error('updateEntry: ungültiger Zeitpunkt');
      if (old.type === 'drink' && p.unit && p.unit !== 'custom' && p.ml == null && state.settings.units[p.unit] != null) {
        p.ml = state.settings.units[p.unit];
      }
      const merged = Object.assign({}, old, p);
      if (p.photoId === null) delete merged.photoId;
      const e = normEntry(merged, state.settings.units);
      if (!e) return null;
      if (old.photoId && old.photoId !== e.photoId) store.deletePhoto(old.photoId);
      state.entries[i] = e;
      sortEntries();
      invalidate();
      save();
      emit('entry', { action: 'update', id: e.id });
      return clone(e);
    },
    /** Löscht einen Eintrag inkl. Foto. opts.keepPhoto=true behält das Foto (für „Rückgängig“). */
    removeEntry(id, opts) {
      const i = state.entries.findIndex(e => e.id === id);
      if (i < 0) return null;
      const [e] = state.entries.splice(i, 1);
      invalidate();
      save();
      if (e.photoId && !(opts && opts.keepPhoto)) store.deletePhoto(e.photoId);
      emit('entry', { action: 'remove', id: e.id });
      return clone(e);
    },
    getEntry(id) {
      const e = state.entries.find(x => x.id === id);
      return e ? clone(e) : null;
    },

    /* --- Datum --- */
    dayKeyOf,
    todayKey,

    entriesForDay(key) {
      return (index().get(key) || []).map(e => Object.assign({}, e));
    },
    entriesInRange(fromKey, toKey) {
      if (!fromKey || !toKey) return [];
      const out = [];
      for (const e of state.entries) {
        const k = dayKeyOf(e.ts);
        if (k && k >= fromKey && k <= toKey) out.push(Object.assign({}, e));
      }
      return out; // state.entries ist immer nach ts sortiert
    },

    /* --- Tage --- */
    getDay(key) {
      const d = state.days[key];
      return d ? clone(d) : { training: null, nightBefore: null };
    },
    setDay(key, patch) {
      if (!KEY_RE.test(String(key))) throw new Error('setDay: ungültiger dayKey ' + key);
      if (!isObj(patch)) return store.getDay(key);
      const p = Object.assign({}, patch);
      if (isObj(p.nightBefore) && !p.nightBefore.answeredAt) p.nightBefore = Object.assign({}, p.nightBefore, { answeredAt: nowISO() });
      const d = normDay(Object.assign({}, state.days[key] || {}, p));
      if (dayIsEmpty(d)) delete state.days[key]; else state.days[key] = d;
      save();
      emit('day', { key, keys: Object.keys(patch) });
      return store.getDay(key);
    },
    goalFor(key) {
      const d = state.days[key];
      return d && d.training === true ? state.settings.goalTraining : state.settings.goalBase;
    },
    dayTotals(key) {
      const list = index().get(key) || [];
      const day = store.getDay(key);
      const goal = store.goalFor(key);
      const byDaypart = {};
      U.DAYPARTS.forEach(p => { byDaypart[p.id] = 0; });
      const byDrink = {};
      DRINKS.forEach(d => { byDrink[d] = 0; });
      const byUnit = { half: 0, glass: 0, bottle: 0, custom: 0 };
      let ml = 0, drinks = 0, toilets = 0, photos = 0, firstDrinkTs = null, lastDrinkTs = null;
      for (const e of list) {
        if (e.type === 'toilet') { toilets++; continue; }
        drinks++;
        ml += e.ml;
        byDaypart[U.daypart(e.ts)] += e.ml;
        byDrink[e.drink] = (byDrink[e.drink] || 0) + e.ml;
        byUnit[e.unit] = (byUnit[e.unit] || 0) + 1;
        if (e.photoId) photos++;
        if (!firstDrinkTs) firstDrinkTs = e.ts;
        lastDrinkTs = e.ts;
      }
      return {
        key, ml, goal,
        pct: goal > 0 ? Math.round((ml / goal) * 100) : 0,
        drinks, toilets,
        training: day.training,
        nightBefore: day.nightBefore,
        byDaypart, firstDrinkTs, lastDrinkTs,
        // Zusatzfelder (über Spec hinaus, rein additiv):
        byDrink, byUnit, photos,
        hasData: list.length > 0 || day.training !== null || day.nightBefore !== null
      };
    },
    dayKeysWithData() {
      const keys = new Set(index().keys());
      Object.keys(state.days).forEach(k => keys.add(k));
      return Array.from(keys).sort();
    },
    firstDayKey() {
      const keys = store.dayKeysWithData();
      const t = todayKey();
      return keys.length && keys[0] < t ? keys[0] : t;
    },

    /* --- Fotos --- */
    photosAvailable() { return !!db; },
    /** Speichert ein Bild-Blob. Liefert die id – oder null, wenn IndexedDB nicht verfügbar ist. */
    async putPhoto(blob) {
      if (!db || !blob) return null;
      const id = 'p_' + U.uid();
      const ok = await new Promise(resolve => {
        try {
          const tx = db.transaction(DB_STORE, 'readwrite');
          tx.objectStore(DB_STORE).put({ id, blob, type: blob.type || 'image/jpeg', createdAt: nowISO() });
          tx.oncomplete = () => resolve(true);
          tx.onerror = tx.onabort = () => { console.warn('[store] Foto nicht gespeichert', tx.error); resolve(false); };
        } catch (e) { console.warn('[store] Foto nicht gespeichert', e); resolve(false); }
      });
      return ok ? id : null;
    },
    async getPhotoURL(id) {
      if (!id || !db) return null;
      const rec = await idb('readonly', os => os.get(id));
      if (!rec || !rec.blob) return null;
      try { return URL.createObjectURL(rec.blob); } catch (e) { return null; }
    },
    async deletePhoto(id) {
      if (!id) return;
      await idb('readwrite', os => os.delete(id));
    },

    /* --- Backup --- */
    async exportJSON() {
      return Object.assign({ app: 'emly', exportedAt: nowISO(), appVersion: Emly.VERSION || null }, clone(state));
    },
    importJSON(obj) {
      let src = obj;
      if (typeof src === 'string') src = JSON.parse(src);
      if (isObj(src) && isObj(src.state)) src = src.state;
      if (!isObj(src) || (!Array.isArray(src.entries) && !isObj(src.settings) && !isObj(src.days))) {
        throw new Error('Das sieht nicht wie ein Emly-Backup aus.');
      }
      const next = normalize(src);
      // Import eines Backups soll kein erneutes Onboarding auslösen, wenn hier schon eingerichtet war.
      if (state.settings.onboarded && !(isObj(src.settings) && typeof src.settings.onboarded === 'boolean')) next.settings.onboarded = true;
      state = next;
      invalidate();
      save();
      emit('import', { entries: state.entries.length, days: Object.keys(state.days).length });
      return { entries: state.entries.length, days: Object.keys(state.days).length };
    },
    async resetAll() {
      await idb('readwrite', os => os.clear());
      try { window.localStorage.removeItem(LS_KEY); } catch (_) { /* egal */ }
      state = defaults();
      invalidate();
      save();
      emit('reset');
    },

    /* --- Game --- */
    getGame() { return clone(state.game); },
    setGame(patch) {
      if (!isObj(patch)) return store.getGame();
      state.game = normGame(Object.assign({}, state.game, patch));
      save();
      emit('game', { keys: Object.keys(patch) });
      return store.getGame();
    }
  };

  /* Änderungen aus einem zweiten Tab übernehmen */
  try {
    window.addEventListener('storage', ev => {
      if (ev.key !== LS_KEY) return;
      if (ev.newValue == null) state = defaults();
      else { try { state = normalize(JSON.parse(ev.newValue)); } catch (_) { return; } }
      invalidate();
      emit('external');
    });
  } catch (_) { /* egal */ }

  Emly.store = store;
})();
