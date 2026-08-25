// clinicClosing.js — the end-of-day gate. OPEN -> RUN -> CLOSE.
// `critical: true` items block closure entirely; the rest warn but
// still allow the clinic to be closed. Split this way because patient
// safety and compliance shouldn't be overridable at 8pm, but a tidy
// room shouldn't physically trap staff in the building.

window.KuBi = window.KuBi || {};

function s(en, hi) { return { en: en, hi: hi }; }

window.KuBi.CLINIC_CLOSING = [
  { id: 'patients',    critical: true,  area: s('Patients', 'मरीज़'),                 check: s('All patients accounted for', 'सभी मरीज़ों का हिसाब पूरा है') },
  { id: 'treatment',   critical: true,  area: s('Treatment', 'इलाज'),                 check: s('All procedures closed', 'सभी प्रोसीज़र पूरे हो चुके हैं') },
  { id: 'records',     critical: true,  area: s('Clinical records', 'क्लिनिकल रिकॉर्ड'), check: s('All documentation complete', 'सारी जानकारी दर्ज हो चुकी है') },
  { id: 'instruments', critical: true,  area: s('Instruments', 'उपकरण'),              check: s('Sent for sterilization', 'स्टरलाइज़ेशन के लिए भेज दिए गए') },
  { id: 'waste',       critical: true,  area: s('Waste', 'कचरा'),                     check: s('Removed', 'हटा दिया गया') },
  { id: 'chairs',      critical: false, area: s('Chairs', 'चेयर'),                    check: s('Cleaned/disinfected', 'साफ और डिसइन्फेक्ट कर दी गईं') },
  { id: 'materials',   critical: false, area: s('Materials', 'सामान'),                check: s('Returned/stored', 'वापस रख दिया गया') },
  { id: 'equipment',   critical: false, area: s('Equipment', 'उपकरण'),                check: s('Switched off', 'बंद कर दिए गए') },
  { id: 'rooms',       critical: false, area: s('Rooms', 'कमरे'),                     check: s('Clean', 'साफ हैं') },
  { id: 'cash',        critical: false, area: s('Cash/payment', 'नकद/भुगतान'),         check: s('Closed', 'बंद कर दिया गया') },
  { id: 'nextday',     critical: false, area: s('Clinic', 'क्लिनिक'),                  check: s('Ready for next day', 'अगले दिन के लिए तैयार है') },
];

window.KuBi.closingStats = function (checkedMap) {
  const map = checkedMap || {};
  const items = window.KuBi.CLINIC_CLOSING;
  const blocking = items.filter(function (it) { return it.critical && !map[it.id]; });
  const pending = items.filter(function (it) { return !map[it.id]; });
  return {
    total: items.length,
    done: items.length - pending.length,
    blocking: blocking,
    pending: pending,
    canClose: blocking.length === 0,
    allDone: pending.length === 0,
  };
};
