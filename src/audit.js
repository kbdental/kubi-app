// audit.js — who changed what, and when.
//
// WHY THIS CANNOT BE DERIVED
// The case timeline works out today's entries from state, which is right for
// a timeline: it can never disagree with what the app believes. An audit
// trail cannot work that way. State remembers only where things ended up —
// equipment marked working, then faulty, then working again leaves one
// value and no history. An audit has to be written at the moment of the
// change or it is not an audit.
//
// So this is the one append-only record in KuBi. Entries are never edited
// and never removed; a correction is another entry.
//
// IT STILL ASKS NOBODY FOR ANYTHING
// Every entry comes from an action staff were taking anyway — a box ticked,
// a button pressed, a status changed. The V2 principle holds: the
// information is already being entered, and this uses it.

window.KuBi = window.KuBi || {};

// The six things the clinic asked to be able to account for, plus the two
// that the day turns on. `area` is what the entry is ABOUT, not where the
// person was standing.
window.KuBi.AUDIT_AREAS = [
  'clinic',          // opened, closed
  'readiness',       // opening checklist
  'treatment',       // before / after steps, procedures
  'closure',         // cases closed, closing checklist
  'equipment',       // faults raised and cleared
  'sterilization',   // packs moved through the chain
  'inventory',       // lab receipts, stock movements
  'patients',        // status changes
  'exceptions',      // repairs reported and fixed
];

// A day generates a lot of small changes, and the whole log rides along with
// the day into ONE spreadsheet cell. Past this ceiling the OLDEST entries are
// dropped and a marker records that it happened, because a log that silently
// loses its beginning is worse than one that admits it.
//
// THE NUMBER IS NOT ARBITRARY. Measured: a full day with no audit is about
// 11,300 characters, one entry about 131, and the cell budget is 45,000. A
// cap of 400 produced a log of 52,800 characters on its own — larger than
// the entire budget — so a busy day would have quietly failed to save, which
// is precisely the failure an audit trail is supposed to protect against.
// 200 leaves roughly a third of the budget spare for a day that grows.
//
// This ceiling is a consequence of storing the day as one JSON cell. The
// real answer is an append-only audit sheet, one row per entry, which is
// part of the production-persistence work rather than something to bolt on
// here.
window.KuBi.AUDIT_MAX = 200;

/**
 * Append one entry. Returns a NEW array — the log is never mutated in
 * place, so React sees the change and nothing can quietly rewrite history.
 */
window.KuBi.auditAppend = function (log, entry) {
  const list = (log || []).slice();
  list.push({
    at: entry.at || new Date(),
    by: entry.by || null,
    area: entry.area,
    action: entry.action,
    subject: entry.subject || null,   // which patient, room, item
    detail: entry.detail || null,     // what it became
  });
  if (list.length > window.KuBi.AUDIT_MAX) {
    // One extra, because the marker itself takes a place. Without that the
    // log settles at MAX + 1 and the ceiling is not the ceiling.
    const dropped = list.length - window.KuBi.AUDIT_MAX + 1;
    const kept = list.slice(dropped);
    kept.unshift({
      at: kept[0] ? kept[0].at : new Date(), by: null, area: 'clinic',
      action: 'auditTruncated', subject: null, detail: String(dropped),
    });
    return kept;
  }
  return list;
};

/** Newest first — an audit is read backwards from what just happened. */
window.KuBi.auditRecent = function (log, limit) {
  const list = (log || []).slice().sort(function (a, b) {
    return new Date(b.at).getTime() - new Date(a.at).getTime();
  });
  return typeof limit === 'number' ? list.slice(0, limit) : list;
};

window.KuBi.auditForArea = function (log, area) {
  return (log || []).filter(function (e) { return e.area === area; });
};

/** Everything that happened to one patient, room or item. */
window.KuBi.auditForSubject = function (log, subject) {
  return (log || []).filter(function (e) { return e.subject === subject; });
};

/** Who touched the clinic today, and how many times each. */
window.KuBi.auditByPerson = function (log) {
  const tally = {};
  (log || []).forEach(function (e) {
    if (!e.by) return;
    tally[e.by] = (tally[e.by] || 0) + 1;
  });
  return Object.keys(tally).map(function (name) {
    return { by: name, changes: tally[name] };
  }).sort(function (a, b) { return b.changes - a.changes; });
};

/**
 * What the entry is about, in words a person uses.
 *
 * The log stores IDS, which is right — an id is stable and a name is not.
 * But an id is an internal, and KuBi's rule is that internals stay behind
 * the screen. This resolves one for display, and falls back to nothing
 * rather than printing a key at somebody.
 */
window.KuBi.auditSubjectLabel = function (entry, ctx) {
  if (!entry || !entry.subject) return null;
  const id = entry.subject;
  const c = ctx || {};
  const lang = c.lang || 'en';
  const t = c.t || function (k) { return k; };
  const pick = function (f) { return f ? (f[lang] || f.en) : null; };

  // A patient, by way of their appointment.
  const appt = (c.appointments || []).find(function (a) { return a.id === id; });
  if (appt) return appt.patient;

  // A chair or a machine.
  const kit = (window.KuBi.equipmentList() || []).find(function (e) { return e.id === id; });
  if (kit) return kit.isChair ? t('clinic.room', lang) + ' ' + kit.room : pick(kit.name);

  // A readiness task: "section — task".
  const m = /^(.+)-g(\d+)-t(\d+)(?:-r(\d+))?$/.exec(id);
  if (m) {
    const section = (window.KuBi.CLINIC_READINESS || []).find(function (sec) { return sec.id === m[1]; });
    if (section) {
      const group = section.groups[Number(m[2])];
      const task = group && group.tasks[Number(m[3])];
      const room = m[4] ? ' (' + t('clinic.room', lang) + ' ' + m[4] + ')' : '';
      if (task) return pick(task.label) + room;
      return pick(section.title) + room;
    }
  }

  // A closing item.
  const closing = (window.KuBi.CLINIC_CLOSING || []).find(function (it) { return it.id === id; });
  if (closing) return pick(closing.area) + ' — ' + pick(closing.check);

  // A piece of lab work.
  const lab = window.KuBi.LAB_CASES && window.KuBi.LAB_CASES[id];
  if (lab) return lab.patient + ' — ' + pick(lab.item);

  // A place in the clinic, for a repair.
  const place = (window.KuBi.REPAIR_PLACES ? window.KuBi.REPAIR_PLACES() : [])
    .find(function (pl) { return pl.id === id; });
  if (place) return window.KuBi.repairPlaceLabel(id, lang, t);

  // A sterilization pack keeps its own printed number, which IS what staff
  // read off the pouch.
  const pack = (window.KuBi.STER_PACKS || []).find(function (pk) { return pk.id === id; });
  if (pack) return pack.id;

  // Unknown: say nothing rather than show a key.
  return null;
};
