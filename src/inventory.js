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
window.KuBi.MATERIALS = [
  { id: 'gutta_percha',  name: s('Gutta percha', 'गटा परचा'),               state: 'low' },
  { id: 'endo_files',    name: s('Endodontic files', 'एंडो फाइल्स'),        state: 'ok' },
  { id: 'anaesthetic',   name: s('Anaesthetic cartridges', 'एनेस्थीसिया कार्ट्रिज'), state: 'ok' },
  { id: 'composite',     name: s('Composite material', 'कंपोजिट मटीरियल'),  state: 'ok' },
  { id: 'impression',    name: s('Impression material', 'इम्प्रेशन मटीरियल'), state: 'ok' },
  { id: 'cement',        name: s('Luting cement', 'ल्यूटिंग सीमेंट'),        state: 'ok' },
  { id: 'implant_comp',  name: s('Implant components', 'इम्प्लांट कंपोनेंट'), state: 'ok' },
  { id: 'sutures',       name: s('Sutures', 'टांके'),                       state: 'ok' },
  { id: 'gauze',         name: s('Gauze', 'गॉज़'),                          state: 'low' },
  { id: 'gloves',        name: s('Gloves', 'ग्लव्स'),                       state: 'ok' },
];

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
    if (m.state === 'out') blocking.push(m);
    else if (m.state === 'low') low.push(m);
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
