// dayStore.js — the operating day, kept somewhere it survives a refresh.
//
// Everything the clinic does during the day lives in React state. That is
// fine until somebody presses F5 at three in the afternoon, at which point
// the morning is gone. This module writes that state through the same
// Google Sheet adapter history uses, and reads it back on load.
//
// WHAT IS STORED, AND WHAT IS NOT
// Only the pieces of state the clinic changes during a day. Which
// screen somebody was looking at is NOT stored: after a refresh you should
// land on your own home screen, not on whatever the last person had open.
//
// DATES
// JSON turns a Date into an ISO string. Every consumer in KuBi already
// re-wraps with new Date(...) before doing arithmetic, so strings survive
// the round trip — but that is a property worth testing rather than
// assuming, and it is tested.
//
// SAFETY
// Nothing here can stop the clinic working. With no sheet configured
// nothing is read or written at all and the app behaves exactly as it did.

window.KuBi = window.KuBi || {};

// The day, and nothing else. Order is not meaningful; presence is.
window.KuBi.DAY_FIELDS = [
  'clinicStatus',
  'readinessChecked',
  'appointments',
  'treatmentChecked',
  'treatmentCheckedAfter',
  'closingChecked',
  'procedureState',
  'closedCases',
  'equipmentStatus',
  'repairs',
  'labReceived',
  'sterPacks',
  // Append-only, and part of the day so a handover or a refresh does not
  // lose who did what.
  'audit',
  // The one thing a follow-up cannot derive: that somebody called.
  'followUpProgress',
];

// A Sheets cell holds 50,000 characters. A day should be nowhere near
// that, but a runaway would fail the write silently, so it is checked.
window.KuBi.DAY_MAX_CHARS = 45000;

/** Every field of the day, as a plain object. */
window.KuBi.snapshotDay = function (day) {
  const out = {};
  window.KuBi.DAY_FIELDS.forEach(function (f) { out[f] = day[f]; });
  // Which KuBi made this day: one running on the clinic's real data, or
  // one running on demo data. Not a day field — nobody changes it.
  out.mode = window.KuBi.isConnected && window.KuBi.isConnected() ? 'connected' : 'demo';
  return out;
};

/**
 * May a stored day be loaded? Always, in demo. Connected, only a day that a
 * connected KuBi saved: one saved on demo data would bring demo repairs,
 * faults and packs back as though they were real.
 */
window.KuBi.dayRestorable = function (state) {
  if (!state) return false;
  if (!(window.KuBi.isConnected && window.KuBi.isConnected())) return true;
  return state.mode === 'connected';
};

/**
 * Push stored values back into state. Fields missing from the stored day
 * are LEFT ALONE rather than blanked — an older record written before a
 * field existed must not wipe today's version of it.
 */
window.KuBi.restoreDay = function (day, data) {
  if (!data) return 0;
  let applied = 0;
  window.KuBi.DAY_FIELDS.forEach(function (f) {
    if (!Object.prototype.hasOwnProperty.call(data, f)) return;
    if (data[f] === undefined || data[f] === null) return;
    const setter = day['set' + f[0].toUpperCase() + f.slice(1)];
    if (!setter) return;
    setter(data[f]);
    applied++;
  });
  return applied;
};

/**
 * Is this stored day worth restoring? A record for a different date is
 * yesterday's clinic, not today's, and must not be loaded over today.
 */
window.KuBi.dayIsForToday = function (record) {
  return !!(record && record.date && record.date === window.KuBi.operatingDate());
};
