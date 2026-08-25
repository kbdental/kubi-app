// equipment.js — the equipment status list shown under CLINIC → Equipment.
// Deliberately minimal: today's status only. Preventive maintenance,
// breakdown history and service records are NOT modelled yet — when they
// are, they belong behind the detail view, not in the main navigation.

window.KuBi = window.KuBi || {};

function s(en, hi) { return { en: en, hi: hi }; }

// Chairs are generated from CLINIC_ROOMS so the two never drift apart.
window.KuBi.SHARED_EQUIPMENT = [
  { id: 'autoclave',   name: s('Autoclave', 'ऑटोक्लेव') },
  { id: 'compressor',  name: s('Compressor', 'कंप्रेसर') },
  { id: 'rvg',         name: s('RVG / X-ray', 'RVG / एक्स-रे') },
  { id: 'ultrasonic',  name: s('Ultrasonic cleaner', 'अल्ट्रासोनिक क्लीनर') },
  { id: 'uv_cabinets', name: s('UV cabinets', 'UV कैबिनेट') },
  { id: 'intraoral',   name: s('Intraoral camera', 'इंट्राओरल कैमरा') },
  { id: 'suction',     name: s('Motorized suction', 'मोटराइज़्ड सक्शन') },
];

// Full list = one entry per chair, then shared equipment.
window.KuBi.equipmentList = function (lang) {
  const chairs = window.KuBi.CLINIC_ROOMS.map(function (room) {
    return { id: 'chair_' + room, isChair: true, room: room, name: null };
  });
  return chairs.concat(window.KuBi.SHARED_EQUIPMENT);
};

// Seeded so the screen isn't empty on first open — one deliberate fault
// so the 🔴 state is visible without staff having to create one.
window.KuBi.EQUIPMENT_STATUS_SEED = {
  chair_3: { ok: false, note: 'Suction issue', at: new Date(), by: 'Priya Sharma' },
};
