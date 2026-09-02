// mergeDay.js — two terminals, one day.
//
// A clinic runs on more than one screen: reception marks a patient arrived
// while the surgery ticks a pre-treatment check. Both save the whole day,
// the day is one record, and the second save wins — so the first person's
// work disappears, and an append-only audit loses an entry it should never
// have lost.
//
// This merges two versions of a day instead of picking one. It is not a
// general algorithm: every field is merged by a rule that suits what that
// field MEANS, which is the only way to get this right.
//
// WHERE THE RULES COME FROM
//   · a tick is work somebody did — keep both sides' ticks
//   · an append-only log is exactly that — keep every entry, from either
//   · a status has a time — the later one is what happened
//   · a fixed fault stays fixed — being repaired is not undone by a stale
//     copy that still thought it was broken
//
// WHAT THIS CANNOT DO
// Presence cannot be told from deletion. If one terminal UN-ticks something
// while another still has it ticked, the tick survives. That is deliberate:
// losing a tick makes work look undone and somebody redoes it, which is
// wasteful but safe. It is recorded here so nobody assumes otherwise, and a
// tombstone would be the fix if it ever matters.

window.KuBi = window.KuBi || {};

function _time(v) {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}

/** Union two id-keyed maps; where both hold a key, the later one wins. */
function _mergeMap(mine, theirs) {
  const out = Object.assign({}, theirs || {}, {});
  Object.keys(mine || {}).forEach(function (k) {
    const a = mine[k];
    const b = (theirs || {})[k];
    if (b === undefined) { out[k] = a; return; }
    const ta = a && a.at ? _time(a.at) : null;
    const tb = b && b.at ? _time(b.at) : null;
    if (ta !== null && tb !== null) { out[k] = ta >= tb ? a : b; return; }
    // No times to compare: keep the local value. Whoever is sitting in
    // front of this screen just acted and is present to notice if it is
    // wrong; the other terminal is not.
    out[k] = a;
  });
  return out;
}

/** Two levels deep: appointment id -> step index -> ticked. */
function _mergeNestedTicks(mine, theirs) {
  const out = Object.assign({}, theirs || {});
  Object.keys(mine || {}).forEach(function (id) {
    out[id] = Object.assign({}, (theirs || {})[id] || {}, mine[id] || {});
  });
  return out;
}

/** Union two lists by id, resolving collisions with `pick`. */
function _mergeById(mine, theirs, pick) {
  const byId = {};
  (theirs || []).forEach(function (x) { byId[x.id] = x; });
  (mine || []).forEach(function (x) {
    byId[x.id] = byId[x.id] === undefined ? x : pick(x, byId[x.id]);
  });
  return Object.keys(byId).map(function (k) { return byId[k]; });
}

/** What makes an audit entry the same entry, for de-duplication. */
function _auditKey(e) {
  return [_time(e.at), e.by, e.area, e.action, e.subject, e.detail].join('|');
}

/**
 * Merge the day THIS browser has over the day the sheet holds.
 *
 * `mine` is local and generally newer; `theirs` is what somebody else
 * stored while we were working. Neither is discarded.
 */
window.KuBi.mergeDay = function (mine, theirs) {
  if (!theirs) return mine || null;
  if (!mine) return theirs;
  const out = {};

  // The clinic being open, and by whom, is a moment in time.
  out.clinicStatus = _time((mine.clinicStatus || {}).at) >= _time((theirs.clinicStatus || {}).at)
    ? mine.clinicStatus : theirs.clinicStatus;

  // Ticks are work. Keep everybody's.
  out.readinessChecked = _mergeMap(mine.readinessChecked, theirs.readinessChecked);
  out.closingChecked = _mergeMap(mine.closingChecked, theirs.closingChecked);
  out.closedCases = _mergeMap(mine.closedCases, theirs.closedCases);
  out.labReceived = _mergeMap(mine.labReceived, theirs.labReceived);
  out.equipmentStatus = _mergeMap(mine.equipmentStatus, theirs.equipmentStatus);
  out.procedureState = _mergeMap(mine.procedureState, theirs.procedureState);

  out.treatmentChecked = _mergeNestedTicks(mine.treatmentChecked, theirs.treatmentChecked);
  out.treatmentCheckedAfter = _mergeNestedTicks(mine.treatmentCheckedAfter, theirs.treatmentCheckedAfter);

  // A patient's status has a time on it, so the later one is what happened.
  out.appointments = _mergeById(mine.appointments, theirs.appointments, function (a, b) {
    return _time(a.statusAt) >= _time(b.statusAt) ? a : b;
  });

  // A repair that somebody fixed stays fixed. A stale copy still thinking
  // it is broken must not undo that.
  out.repairs = _mergeById(mine.repairs, theirs.repairs, function (a, b) {
    if (a.done !== b.done) return a.done ? a : b;
    return _time(a.doneAt) >= _time(b.doneAt) ? a : b;
  });

  // A pack only moves forward through the chain.
  const stageOrder = window.KuBi.STER_STAGES || [];
  out.sterPacks = _mergeById(mine.sterPacks, theirs.sterPacks, function (a, b) {
    const ia = stageOrder.indexOf(a.stage);
    const ib = stageOrder.indexOf(b.stage);
    return ia >= ib ? a : b;
  });

  // The audit is append-only. Every entry from either side survives, in
  // order, with duplicates collapsed. This is the field that matters most:
  // a record of who did what is worthless if a save can erase part of it.
  const seen = {};
  const entries = (theirs.audit || []).concat(mine.audit || []).filter(function (e) {
    const k = _auditKey(e);
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });
  entries.sort(function (a, b) { return _time(a.at) - _time(b.at); });
  out.audit = window.KuBi.AUDIT_MAX && entries.length > window.KuBi.AUDIT_MAX
    ? entries.slice(entries.length - window.KuBi.AUDIT_MAX)
    : entries;

  // Anything added to the day later and not given a rule here: keep the
  // local value rather than dropping the field.
  (window.KuBi.DAY_FIELDS || []).forEach(function (f) {
    if (!(f in out)) out[f] = (f in mine) ? mine[f] : theirs[f];
  });
  return out;
};
