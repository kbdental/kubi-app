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
window.KuBi.LAB_CASES = {
  A2: { received: true,  item: s('Crown', 'क्राउन'),
        patient: 'Meera Reddy', lab: 'Sharma Dental Lab', sent: _labDay(-6), due: _labDay(-1) },
  A4: { received: true,  item: s('Implant prosthesis', 'इम्प्लांट प्रोस्थेसिस'),
        patient: 'Devika Nair', lab: 'Precision Ceramics', sent: _labDay(-9), due: _labDay(0) },
  A7: { received: false, item: s('Crown', 'क्राउन'),
        patient: 'Vikram Shah', lab: 'Sharma Dental Lab', sent: _labDay(-8), due: _labDay(-2) },
  A8: { received: false, item: s('Denture — try-in', 'डेन्चर — ट्राई-इन'),
        patient: 'Leela Menon', lab: 'Precision Ceramics', sent: _labDay(-3), due: _labDay(2) },
};

// Every lab case, as a list, newest deadline last. Shaped for a screen
// rather than for the supply check that LAB_CASES was written for.
// Has this case arrived? The seed says what was true when the day loaded;
// `received` (held by the app) says what the clinic has ticked since. One
// answer, used by the Lab screen and the supply check alike.
window.KuBi.labArrived = function (apptId, received) {
  const c = window.KuBi.LAB_CASES[apptId];
  if (!c) return true;
  if (received && Object.prototype.hasOwnProperty.call(received, apptId)) return !!received[apptId];
  return !!c.received;
};

window.KuBi.labCases = function (received) {
  return Object.keys(window.KuBi.LAB_CASES).map(function (apptId) {
    const c = window.KuBi.LAB_CASES[apptId];
    return Object.assign({ apptId: apptId }, c, { received: window.KuBi.labArrived(apptId, received) });
  }).sort(function (a, b) { return String(a.due || '').localeCompare(String(b.due || '')); });
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
window.KuBi.procedureSupplyStatus = function (procedureType, apptId, received) {
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
  const lab = apptId ? window.KuBi.LAB_CASES[apptId] : null;
  const labMissing = !!(lab && !window.KuBi.labArrived(apptId, received));

  return {
    ok: blocking.length === 0 && !labMissing,
    blocking: blocking,
    low: low,
    lab: lab || null,
    labMissing: labMissing,
  };
};
