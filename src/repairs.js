// repairs.js — plumbing, electrical and fitting faults, tracked from the
// moment somebody notices one until it is actually fixed.
//
// The daily checklist can only record that a fault was REPORTED. A leaking
// tap ticked off in the morning is still leaking in the evening, and the
// tick says nothing about that. A repair therefore has a life of its own:
// it stays open, it ages, and it is visible until closed.
//
// Deliberately small: what it is, where it is, who raised it, and whether
// it is done. No cost, no vendor, no invoice — none of that helps the
// person standing in front of a broken tap.

window.KuBi = window.KuBi || {};

function s(en, hi) { return { en: en, hi: hi }; }

// Where a fault can be. Rooms come from CLINIC_ROOMS so the two never
// drift apart; the rest are the shared parts of the clinic.
window.KuBi.REPAIR_PLACES = function () {
  const rooms = (window.KuBi.CLINIC_ROOMS || []).map(function (r) {
    return { id: 'room_' + r, room: r, name: null };
  });
  return rooms.concat([
    { id: 'reception', name: s('Reception', 'रिसेप्शन') },
    { id: 'waiting', name: s('Waiting area', 'वेटिंग एरिया') },
    { id: 'washroom', name: s('Washroom', 'वॉशरूम') },
    { id: 'pantry', name: s('Pantry', 'पैंट्री') },
    { id: 'sterilization', name: s('Sterilization room', 'स्टरलाइज़ेशन रूम') },
    { id: 'common', name: s('Common area', 'कॉमन एरिया') },
  ]);
};

window.KuBi.REPAIR_KINDS = [
  { id: 'plumbing', name: s('Plumbing', 'प्लंबिंग') },
  { id: 'electrical', name: s('Electrical', 'बिजली') },
  { id: 'furniture', name: s('Furniture / fitting', 'फर्नीचर / फिटिंग') },
  { id: 'other', name: s('Something else', 'कुछ और') },
];

window.KuBi.repairPlaceLabel = function (placeId, lang, t) {
  const place = window.KuBi.REPAIR_PLACES().find(function (p) { return p.id === placeId; });
  if (!place) return '';
  if (place.room) return t('clinic.room', lang) + ' ' + place.room;
  return place.name[lang] || place.name.en;
};

window.KuBi.repairKindLabel = function (kindId, lang) {
  const k = window.KuBi.REPAIR_KINDS.find(function (x) { return x.id === kindId; });
  return k ? (k.name[lang] || k.name.en) : '';
};

// Seeded with one open fault so the screen is never empty on first open,
// the same reason equipment carries one.
window.KuBi.REPAIRS_SEED = [
  {
    id: 'R1', kind: 'plumbing', place: 'washroom',
    what: 'Tap dripping constantly',
    by: 'Priya Sharma', at: new Date(Date.now() - 2 * 86400000),
    done: false, doneAt: null,
  },
];

// How old, in whole days. Used to say "open 2 days", never stored.
window.KuBi.repairAgeDays = function (repair, now) {
  const from = new Date(repair.at).getTime();
  const to = (now || new Date()).getTime();
  return Math.max(0, Math.floor((to - from) / 86400000));
};

// A fault nobody has fixed after this long is stated as overdue. Two days
// is the clinic's own "report it immediately" turned into something the
// screen can check.
window.KuBi.REPAIR_OVERDUE_DAYS = 2;

window.KuBi.repairIsOverdue = function (repair, now) {
  return !repair.done && window.KuBi.repairAgeDays(repair, now) >= window.KuBi.REPAIR_OVERDUE_DAYS;
};

window.KuBi.openRepairs = function (repairs) {
  return (repairs || []).filter(function (r) { return !r.done; });
};

// Oldest first: the one that has been waiting longest is the one to chase.
window.KuBi.repairsByAge = function (repairs) {
  return (repairs || []).slice().sort(function (a, b) {
    return new Date(a.at).getTime() - new Date(b.at).getTime();
  });
};
