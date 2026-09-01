// inventory.js — inventory expressed as a readiness question, not a
// stock ledger. The only question that matters operationally:
//
//     Can today's / tomorrow's planned treatments actually be performed?
//
// So materials are mapped to the procedures that consume them, and the
// UI reports per-procedure readiness rather than item counts.

window.KuBi = window.KuBi || {};

function s(en, hi) { return { en: en, hi: hi }; }

// Stock levels. `low` means below the reorder threshold but usable;
// `out` blocks any procedure needing it.
// Stock, with the numbers behind it. `state` is DERIVED from quantity
// against the minimum — it is not a field anybody sets, because a
// hand-set state and a quantity are two facts that will disagree.
//
// Staff never see these numbers. The clinic view stays READY / LOW / NOT
// AVAILABLE, which is all that changes what somebody does. The quantities
// exist so KuBi can answer what tomorrow needs and what to reorder.
//
// ⚠ QUANTITIES AND MINIMUMS NEED THE CLINIC'S OWN FIGURES. These reproduce
//   the states the app already showed; they are not a stock count.
window.KuBi.MATERIALS = [
  { id: 'gutta_percha',  name: s('Gutta percha', 'गटा परचा'),                    qty: 6,   min: 10, unit: 'packs' },
  { id: 'endo_files',    name: s('Endodontic files', 'एंडो फाइल्स'),             qty: 40,  min: 12, unit: 'sets' },
  { id: 'anaesthetic',   name: s('Anaesthetic cartridges', 'एनेस्थीसिया कार्ट्रिज'), qty: 120, min: 40, unit: 'cartridges' },
  { id: 'composite',     name: s('Composite material', 'कंपोजिट मटीरियल'),       qty: 25,  min: 8,  unit: 'syringes' },
  { id: 'impression',    name: s('Impression material', 'इम्प्रेशन मटीरियल'),     qty: 18,  min: 6,  unit: 'packs' },
  { id: 'cement',        name: s('Luting cement', 'ल्यूटिंग सीमेंट'),             qty: 14,  min: 5,  unit: 'packs' },
  { id: 'implant_comp',  name: s('Implant components', 'इम्प्लांट कंपोनेंट'),      qty: 9,   min: 4,  unit: 'sets' },
  { id: 'sutures',       name: s('Sutures', 'टांके'),                            qty: 30,  min: 10, unit: 'packs' },
  { id: 'gauze',         name: s('Gauze', 'गॉज़'),                               qty: 8,   min: 12, unit: 'packs' },
  { id: 'gloves',        name: s('Gloves', 'ग्लव्स'),                            qty: 400, min: 100, unit: 'pairs' },
];

/**
 * READY / LOW / NOT AVAILABLE, and nothing more complicated than that.
 * Derived every time so it cannot drift from the quantity it describes.
 */
window.KuBi.materialState = function (m) {
  if (!m) return 'ok';
  if (typeof m.qty !== 'number') return m.state || 'ok';   // unmeasured stock
  if (m.qty <= 0) return 'out';
  if (m.qty <= m.min) return 'low';
  return 'ok';
};

/** At or below its minimum — the reorder line. */
window.KuBi.needsReorder = function (m) {
  return window.KuBi.materialState(m) !== 'ok';
};

/** Everything to reorder, emptiest first. */
window.KuBi.reorderList = function () {
  return (window.KuBi.MATERIALS || [])
    .filter(window.KuBi.needsReorder)
    .sort(function (a, b) {
      const sa = window.KuBi.materialState(a) === 'out' ? 0 : 1;
      const sb = window.KuBi.materialState(b) === 'out' ? 0 : 1;
      return sa - sb || (a.qty / (a.min || 1)) - (b.qty / (b.min || 1));
    });
};

// Which materials each procedure needs. Only procedures with real
// material dependencies are listed; anything absent is assumed supplied.
window.KuBi.PROCEDURE_MATERIALS = {
  'RCT':                 ['gutta_percha', 'endo_files', 'anaesthetic'],
  'Crown':               ['impression', 'cement'],
  'Bridge':              ['impression', 'cement'],
  'Veneer':              ['impression', 'cement'],
  'Filling':             ['composite', 'anaesthetic'],
  'Extraction':          ['anaesthetic', 'gauze'],
  'Surgical Extraction': ['anaesthetic', 'gauze', 'sutures'],
  'Implant Surgery':     ['implant_comp', 'anaesthetic', 'sutures'],
  'Implant Prosthesis':  ['implant_comp', 'impression'],
  'Scaling':             ['gloves'],
  'Consultation':        [],
};

// Dates for the seeded lab cases, relative to today so the screen is never
// stale on a Monday morning.
function _labDay(offset) {
  return window.KuBi.operatingDate(new Date(Date.now() + offset * 86400000));
}

// Lab cases are a separate kind of dependency: not stock, but "has the
// lab work come back for this specific patient?"
// `received` is what blocks an appointment; `due` is what lets the case be
// chased BEFORE the patient is sitting in the waiting room. A case with no
// due date is not overdue — unknown is not a deadline.
// Lab work belongs to the CASE, not to the visit that happened to send it.
// A crown is sent at the preparation visit and needed at the fitting —
// different appointments, one case. Keying this by appointment meant
// readiness looked for the crown under the wrong visit and reported a
// fitting as ready to start while the crown was still at the lab.
//
// `apptId` records which visit sent it, which is worth keeping; it is not
// what anything looks it up by.
window.KuBi.LAB_CASES = {
  L1: { id: 'L1', caseId: 'MR0184-CROWN_SINGLE-01', apptId: 'A2',
        item: s('Crown', 'क्राउन'), patient: 'Meera Reddy', lab: 'Sharma Dental Lab',
        sent: _labDay(-6), due: _labDay(-1), received: true, receivedOn: _labDay(-1) },
  L2: { id: 'L2', caseId: 'DN077-IMPLANT_CROWN-01', apptId: 'A4',
        item: s('Implant prosthesis', 'इम्प्लांट प्रोस्थेसिस'), patient: 'Devika Nair', lab: 'Precision Ceramics',
        sent: _labDay(-9), due: _labDay(0), received: true, receivedOn: _labDay(0) },
  L3: { id: 'L3', caseId: 'VS0221-CROWN_SINGLE-01', apptId: 'A7',
        item: s('Crown', 'क्राउन'), patient: 'Vikram Shah', lab: 'Sharma Dental Lab',
        sent: _labDay(-8), due: _labDay(-2), received: false, receivedOn: null },
  L4: { id: 'L4', caseId: 'LM0455-RCT_MOLAR-01', apptId: 'A8',
        item: s('Denture — try-in', 'डेन्चर — ट्राई-इन'), patient: 'Leela Menon', lab: 'Precision Ceramics',
        sent: _labDay(-3), due: _labDay(2), received: false, receivedOn: null },
};

/** Has this piece of lab work arrived? The seed, unless the clinic has
 *  since ticked it. One answer, used by every screen and by readiness. */
window.KuBi.labArrived = function (labId, received) {
  const l = window.KuBi.LAB_CASES[labId];
  if (!l) return true;
  if (received && Object.prototype.hasOwnProperty.call(received, labId)) return !!received[labId];
  return !!l.received;
};

/** Every piece of lab work, soonest promise first. */
window.KuBi.labCases = function (received) {
  return Object.keys(window.KuBi.LAB_CASES).map(function (id) {
    const l = window.KuBi.LAB_CASES[id];
    return Object.assign({}, l, { received: window.KuBi.labArrived(id, received) });
  }).sort(function (a, b) { return String(a.due || '').localeCompare(String(b.due || '')); });
};

/** The lab work for a case — the lookup that matters. */
window.KuBi.labForCase = function (caseId, received) {
  if (!caseId) return [];
  return window.KuBi.labCases(received).filter(function (l) { return l.caseId === caseId; });
};

/** ...and for whoever is in the chair, via their case. */
window.KuBi.labForAppointment = function (appt, received) {
  if (!appt) return [];
  if (appt.caseId) return window.KuBi.labForCase(appt.caseId, received);
  // A one-off visit with no case can still have lab work booked to it.
  return window.KuBi.labCases(received).filter(function (l) { return l.apptId === appt.id; });
};

// Late means: still not here, and the day it was promised has passed.
// Derived every time, never stored — a stored flag goes stale overnight.
window.KuBi.labIsLate = function (c) {
  return !c.received && !!c.due && c.due < window.KuBi.operatingDate();
};

window.KuBi.labIsDueToday = function (c) {
  return !c.received && !!c.due && c.due === window.KuBi.operatingDate();
};

window.KuBi.labPending = function (received) {
  return window.KuBi.labCases(received).filter(function (c) { return !c.received; });
};

window.KuBi.materialById = function (id) {
  return window.KuBi.MATERIALS.find(function (m) { return m.id === id; });
};

// Can this procedure be performed? Returns blocking (out of stock) and
// warning (low) materials separately — low stock shouldn't stop today's
// treatment, but it should be visible.
/**
 * Can this procedure go ahead? Materials, plus the case's lab work.
 * Takes the APPOINTMENT rather than an id, because the lab question is
 * "has this patient's work come back", which is a question about their
 * case and not about today's booking.
 */
window.KuBi.procedureSupplyStatus = function (procedureType, appt, received) {
  const needed = window.KuBi.PROCEDURE_MATERIALS[procedureType] || [];
  const blocking = [];
  const low = [];

  needed.forEach(function (mid) {
    const m = window.KuBi.materialById(mid);
    if (!m) return;
    const st = window.KuBi.materialState(m);
    if (st === 'out') blocking.push(m);
    else if (st === 'low') low.push(m);
  });

  // Lab case, where one applies to this appointment.
  // Every piece of lab work on this case, not just one.
  const labItems = window.KuBi.labForAppointment(appt, received);
  const awaited = labItems.filter(function (l) { return !l.received; });
  const labMissing = awaited.length > 0;

  // The template knows whether this treatment involves a lab at all, so a
  // procedure that needs one with nothing recorded is its own problem —
  // not the same as one that is simply not back yet.
  const expectsLab = !!(window.KuBi.TREATMENT_NEEDS_LAB || {})[procedureType];
  const labUnrecorded = expectsLab && labItems.length === 0;

  return {
    ok: blocking.length === 0 && !labMissing,
    blocking: blocking,
    low: low,
    lab: awaited[0] || labItems[0] || null,
    labItems: labItems,
    labMissing: labMissing,
    labExpected: expectsLab,
    labUnrecorded: labUnrecorded,
  };
};

// ---- what is coming, and whether the clinic can do it -----------------
//
// KuBi knew only about today, so "will tomorrow be a problem" could not be
// asked. UPCOMING is the booked diary beyond today. In a connected setup
// it comes from Clinical Suite, which owns appointments; standalone it is
// maintained here, and an empty list is valid — a clinic with nothing
// booked is not an error.
var _upDay = function (offset) {
  return window.KuBi.operatingDate(new Date(Date.now() + offset * 86400000));
};
window.KuBi.UPCOMING = [
  { date: _upDay(1), patient: 'Meera Reddy',   procedureType: 'Crown',              caseId: 'MR0184-CROWN_SINGLE-01' },
  { date: _upDay(1), patient: 'Imran Qureshi', procedureType: 'RCT',                caseId: null },
  { date: _upDay(2), patient: 'Devika Nair',   procedureType: 'Implant Prosthesis', caseId: 'DN077-IMPLANT_CROWN-01' },
  { date: _upDay(3), patient: 'Vikram Shah',   procedureType: 'Crown',              caseId: 'VS0221-CROWN_SINGLE-01' },
  { date: _upDay(5), patient: 'Leela Menon',   procedureType: 'RCT',                caseId: 'LM0455-RCT_MOLAR-01' },
];

/** What is booked between two dates, inclusive. */
window.KuBi.bookedBetween = function (fromDate, toDate) {
  return (window.KuBi.UPCOMING || []).filter(function (u) {
    return u.date >= fromDate && u.date <= toDate;
  });
};

/**
 * Which materials the work in a window needs, and how each of them stands.
 * One entry per material, not per appointment: staff reorder gauze once,
 * however many treatments want it.
 */
window.KuBi.requirementFor = function (procedureTypes) {
  const seen = {};
  (procedureTypes || []).forEach(function (type) {
    const ids = (window.KuBi.PROCEDURE_MATERIALS || {})[type]
             || (window.KuBi.PROCEDURE_MATERIALS_V2 || {})[type]
             || [];
    ids.forEach(function (id) {
      const m = window.KuBi.materialById(id);
      if (!m) return;
      if (!seen[id]) seen[id] = { material: m, state: window.KuBi.materialState(m), forTypes: [] };
      if (seen[id].forTypes.indexOf(type) === -1) seen[id].forTypes.push(type);
    });
  });
  // Worst first: what stops work before what merely worries.
  const rank = { out: 0, low: 1, ok: 2 };
  return Object.keys(seen).map(function (id) { return seen[id]; })
    .sort(function (a, b) { return rank[a.state] - rank[b.state]; });
};

/**
 * Today, tomorrow, the rest of the week, and what to reorder.
 *
 * Only problems are returned for the three periods — a list of everything
 * that is fine is a list nobody reads. Reorder is separate because it is
 * the manager's job, not the question "can we work today".
 */
window.KuBi.supplyOutlook = function (appointmentsToday) {
  const today = window.KuBi.operatingDate();
  const tomorrow = _upDay(1);
  const weekEnd = _upDay(7);
  const problems = function (reqs) {
    return reqs.filter(function (r) { return r.state !== 'ok'; });
  };
  const typesToday = (appointmentsToday || []).map(function (a) { return a.procedureType; });
  const typesTomorrow = window.KuBi.bookedBetween(tomorrow, tomorrow).map(function (u) { return u.procedureType; });
  const typesWeek = window.KuBi.bookedBetween(tomorrow, weekEnd).map(function (u) { return u.procedureType; });

  return {
    today: problems(window.KuBi.requirementFor(typesToday)),
    tomorrow: problems(window.KuBi.requirementFor(typesTomorrow)),
    week: problems(window.KuBi.requirementFor(typesWeek)),
    reorder: window.KuBi.reorderList(),
  };
};
