// patientCheckIn.js — pre-arrival readiness (from the Patient Arrival &
// Reception SOP, section 1) plus today's appointment list with check-in
// status. No booking/scheduling here by design — that lives in another
// app. Appointment data is mocked until a real source is connected,
// same pattern as Attendance and Clinic Readiness.

window.KuBi = window.KuBi || {};

function s(en, hi) { return { en: en, hi: hi }; }

window.KuBi.PRE_ARRIVAL_READINESS = {
  title: s('Pre-Arrival Readiness', 'मरीज़ आने से पहले की तैयारी'),
  ownerRole: 'front_desk_receptionist', contingencyRole: 'lead_dental_assistant',
  tasks: [
    { label: s('Dental Assistants briefed on today\u2019s appointments in their operatory', 'डेंटल असिस्टेंट को आज की अपॉइंटमेंट की जानकारी दी गई'), details: [] },
    { label: s('Hand sanitizer stocked at the clinic entrance', 'क्लिनिक के प्रवेश द्वार पर हैंड सैनिटाइज़र उपलब्ध है'), details: [] },
    { label: s('Shoe cover dispenser stocked, "Used" bin in position', 'शू कवर डिस्पेंसर भरा हुआ है, "Used" डिब्बा सही जगह पर है'), details: [] },
  ],
};

// status: 'booked' | 'arrived' | 'waiting' | 'in_chair' | 'done' | 'late' | 'no_show'
// Placeholder case/stage data, shaped to the Clinical Suite V2 spec.
// V2 principle: STAGE is the logic, visitCounter is only a counter — so
// KuBi displays current/next stage, not "visit 2 of 3". All fields are
// OPTIONAL: an appointment without them is a valid one-off visit, and
// KuBi must render fine either way (standalone buyers have no Clinical Suite).
window.KuBi.APPOINTMENTS_TODAY = [
  { id: 'A1', patient: 'Arjun Prasad', isNew: false, time: '09:30', chair: 1, doctor: 'Dr. Ananya Rao', treatment: 'Root canal, upper left 6', procedureType: 'RCT', status: 'in_chair', statusAt: new Date(Date.now() - 10 * 60000),
    caseId: 'AP0311-RCT_MOLAR-01', currentStageCode: 'T', currentStageName: 'Cleaning / medication', nextStageName: 'Obturation', visitCounter: 2,
    caseStages: [
      { name: 'Cleaning', done: true },
      { name: 'Cleaning / medication', done: false, current: true },
      { name: 'Obturation', done: false },
      { name: 'Restoration', done: false },
    ] },
  { id: 'A2', patient: 'Meera Reddy', isNew: false, time: '10:15', chair: 2, doctor: 'Dr. Karan Mehta', treatment: 'Crown delivery', procedureType: 'Crown', status: 'waiting', statusAt: new Date(Date.now() - 22 * 60000),
    caseId: 'MR0184-CROWN_SINGLE-01', currentStageCode: 'C', currentStageName: 'Final fitting', nextStageName: null, visitCounter: 3,
    caseStages: [
      { name: 'Preparation', done: true },
      { name: 'Try-in', done: true },
      { name: 'Final fitting', done: false, current: true },
    ] },
  { id: 'A3', patient: 'Kabir Singh', isNew: true, time: '10:45', chair: 3, doctor: 'Dr. Ananya Rao', treatment: 'Scaling and polish', procedureType: 'Scaling', status: 'arrived', statusAt: new Date(Date.now() - 5 * 60000),
    caseId: 'KS0502-SCALING-01', currentStageCode: 'T', currentStageName: 'Scaling + polishing', nextStageName: null, visitCounter: 1,
    caseStages: [
      { name: 'Scaling + polishing', done: false, current: true },
    ] },
  { id: 'A4', patient: 'Devika Nair', isNew: false, time: '11:30', chair: 4, doctor: 'Dr. Karan Mehta', treatment: 'Implant review', procedureType: 'Implant Prosthesis', status: 'booked', statusAt: null,
    caseId: 'DN077-IMPLANT_CROWN-01', currentStageCode: 'TI', currentStageName: 'Healing review', nextStageName: 'Scan / impression', visitCounter: 2,
    caseStages: [
      { name: 'Implant placement', done: true },
      { name: 'Healing review', done: false, current: true },
      { name: 'Scan / impression', done: false },
      { name: 'Try-in', done: false },
      { name: 'Fitting', done: false },
    ] },
  // Deliberately has NO case fields — proves KuBi still renders a plain
  // appointment when Clinical Suite isn't connected.
  { id: 'A5', patient: 'Rohan Gupta', isNew: true, time: '09:00', chair: 1, doctor: 'Dr. Ananya Rao', treatment: 'New patient consultation', procedureType: 'Consultation', status: 'no_show', statusAt: new Date(Date.now() - 40 * 60000) },
];

window.KuBi.CHAIRS = [1, 2, 3, 4];

window.KuBi.CHECKIN_STATUSES = ['booked', 'arrived', 'waiting', 'in_chair', 'in_treatment', 'done', 'late', 'no_show'];

// The six stages shown in the horizontal journey strip, in order.
// 'late' and 'no_show' are exceptions to this flow, not stages in it.
window.KuBi.JOURNEY_STAGES = ['booked', 'arrived', 'waiting', 'in_chair', 'in_treatment', 'done'];

window.KuBi.PRE_PROCEDURE_PREP = {
  title: s('Pre-Procedure Patient Preparation', 'प्रोसीज़र से पहले मरीज़ की तैयारी'),
  subtitle: s('Dental chair asepsis performed visibly in front of the patient', 'डेंटल चेयर की सफाई मरीज़ के सामने ही की जाती है'),
  ownerRole: 'sterilization_technician', contingencyRole: 'lead_dental_assistant',
  steps: [
    s('DA performs the full dental chair asepsis process visibly in front of the patient before seating them', 'मरीज़ को बिठाने से पहले DA पूरी डेंटल चेयर सफाई प्रक्रिया उनके सामने करें'),
    s('Patient escorted to the operatory and made comfortable on the dental chair', 'मरीज़ को ऑपरेटरी में ले जाकर डेंटल चेयर पर आराम से बिठाएं'),
    s('Patient case file and appointment notes handed to the DA', 'मरीज़ की केस फाइल और अपॉइंटमेंट नोट्स DA को दें'),
    s('Patient offered Chlorhexidine Gluconate 0.2% or Povidone Iodine 0.2% oral rinse for 1 minute', 'मरीज़ को 1 मिनट के लिए Chlorhexidine Gluconate 0.2% या Povidone Iodine 0.2% माउथ रिंस दें'),
    s('Patient draped with a disposable or autoclavable drape after the oral rinse', 'माउथ रिंस के बाद मरीज़ को डिस्पोज़ेबल या ऑटोक्लेवेबल ड्रेप से ढकें'),
    s('Dental light adjusted to illuminate the oral cavity', 'डेंटल लाइट को मुंह के अंदर सही रोशनी के लिए सेट करें'),
    s('DA confirms with the doctor that the patient is ready for assessment/procedure', 'DA डॉक्टर को बताएं कि मरीज़ जांच/प्रोसीज़र के लिए तैयार है'),
  ],
};

// Returns { current, next } stage names for display, or null when the
// appointment carries no case data (one-off visit / no Clinical Suite).
// V2: stage is what matters — the visit counter is not shown as logic.
window.KuBi.stageLabel = function (appt) {
  if (!appt || !appt.currentStageName) return null;
  return { current: appt.currentStageName, next: appt.nextStageName || null };
};

// Follow-ups due. In a connected setup this comes from Clinical Suite
// (which owns appointments); standalone, it's maintained here. `due` is
// a plain date string so KuBi never has to reason about scheduling.
var _fuDay = function (offset) { return window.KuBi.operatingDate(new Date(Date.now() + offset * 86400000)); };
window.KuBi.FOLLOW_UPS = [
  { id: 'F1', patient: 'Sanjay Bhatt',  reason: 'Suture removal',      due: _fuDay(0) },
  { id: 'F2', patient: 'Anita Desai',   reason: 'Post-implant review', due: _fuDay(1) },
  { id: 'F3', patient: 'Vikram Shah',   reason: 'Crown fitting',       due: _fuDay(-4), phone: true },
  { id: 'F4', patient: 'Leela Menon',   reason: 'RCT review',          due: _fuDay(3) },
];

// Overdue is DERIVED from the date, never stored — a stored flag goes
// stale the moment the date passes.
window.KuBi.isOverdue = function (f) {
  return f.due < window.KuBi.operatingDate();
};
