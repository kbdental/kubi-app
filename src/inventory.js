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

// Lab cases are a separate kind of dependency: not stock, but "has the
// lab work come back for this specific patient?"
window.KuBi.LAB_CASES = {
  A2: { received: true,  item: s('Crown', 'क्राउन') },
  A4: { received: true,  item: s('Implant prosthesis', 'इम्प्लांट प्रोस्थेसिस') },
};

window.KuBi.materialById = function (id) {
  return window.KuBi.MATERIALS.find(function (m) { return m.id === id; });
};

// Can this procedure be performed? Returns blocking (out of stock) and
// warning (low) materials separately — low stock shouldn't stop today's
// treatment, but it should be visible.
window.KuBi.procedureSupplyStatus = function (procedureType, apptId) {
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
  const labMissing = !!(lab && !lab.received);

  return {
    ok: blocking.length === 0 && !labMissing,
    blocking: blocking,
    low: low,
    lab: lab || null,
    labMissing: labMissing,
  };
};
