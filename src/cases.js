// cases.js — the Case: the thread that connects everything KuBi knows
// about one course of treatment.
//
//     Patient → Case → Stage → Visit → Closure
//
// A case is NOT a screen. There is no Cases area and there must not be
// one: a case is reached by clicking a patient, a treatment, or today's
// appointment. This module is the object underneath those clicks.
//
// WHY THIS EXISTS
// V1 held case data as FIELDS on today's appointment — caseId, the stage
// names, caseStages. That works while the patient is on today's list and
// vanishes when they are not: a case mid-treatment with no appointment
// today existed nowhere. Lab work was keyed by appointment, follow-ups
// and lapsed patients by patient NAME, and nothing referenced a case, so
// the chain above was four separate chains that never met.
//
// WHERE THE TRUTH LIVES
// One place per fact, deliberately:
//   · the case's identity and its stage list — here
//   · progress through the stages TODAY — the appointment, because that
//     is the live state staff are changing and the state that persists
//   · whether today's visit is documented — closedCases, as before
// caseThread() assembles them. Nothing is copied, so nothing can disagree.

window.KuBi = window.KuBi || {};

// Cases the clinic has open. In a connected setup this comes from Clinical
// Suite, which owns the clinical record; standalone, it is maintained here.
// Two of these have no appointment today on purpose — a case does not stop
// existing because nobody is booked in for it.
window.KuBi.CASES = {
  'AP0311-RCT_MOLAR-01': {
    caseId: 'AP0311-RCT_MOLAR-01', patient: 'Arjun Prasad',
    procedureType: 'RCT', treatment: 'Root canal, upper left 6',
    diagnosis: 'Irreversible pulpitis, 26',
    stages: ['Cleaning', 'Cleaning / medication', 'Obturation', 'Restoration'],
  },
  'MR0184-CROWN_SINGLE-01': {
    caseId: 'MR0184-CROWN_SINGLE-01', patient: 'Meera Reddy',
    procedureType: 'Crown', treatment: 'Crown delivery',
    diagnosis: 'Fractured cusp, 46',
    stages: ['Preparation', 'Try-in', 'Final fitting'],
  },
  'KS0502-SCALING-01': {
    caseId: 'KS0502-SCALING-01', patient: 'Kabir Singh',
    procedureType: 'Scaling', treatment: 'Scaling and polish',
    diagnosis: 'Generalised gingivitis',
    stages: ['Scaling + polishing'],
  },
  'DN077-IMPLANT_CROWN-01': {
    caseId: 'DN077-IMPLANT_CROWN-01', patient: 'Devika Nair',
    procedureType: 'Implant Prosthesis', treatment: 'Implant review',
    diagnosis: 'Missing 36, implant placed',
    stages: ['Implant placement', 'Healing review', 'Scan / impression', 'Try-in', 'Fitting'],
  },
  // Open, and nobody is booked in today. These are the cases V1 could not
  // see at all.
  'VS0221-CROWN_SINGLE-01': {
    caseId: 'VS0221-CROWN_SINGLE-01', patient: 'Vikram Shah',
    procedureType: 'Crown', treatment: 'Crown, lower right 6',
    diagnosis: 'Root treated 46, needs coverage',
    stages: ['Preparation', 'Try-in', 'Final fitting'],
    stagesDone: ['Preparation'],
  },
  'LM0455-RCT_MOLAR-01': {
    caseId: 'LM0455-RCT_MOLAR-01', patient: 'Leela Menon',
    procedureType: 'RCT', treatment: 'Root canal, lower left 7',
    diagnosis: 'Apical periodontitis, 37',
    stages: ['Cleaning', 'Cleaning / medication', 'Obturation', 'Restoration'],
    stagesDone: ['Cleaning', 'Cleaning / medication', 'Obturation'],
  },
};

window.KuBi.caseById = function (caseId) {
  return (caseId && window.KuBi.CASES[caseId]) || null;
};

window.KuBi.allCases = function () {
  return Object.keys(window.KuBi.CASES).map(function (id) { return window.KuBi.CASES[id]; });
};

window.KuBi.casesForPatient = function (patient) {
  return window.KuBi.allCases().filter(function (c) { return c.patient === patient; });
};

/** Today's appointment for a case, if the patient is booked in. */
window.KuBi.appointmentForCase = function (caseId, appointments) {
  return (appointments || []).find(function (a) { return a.caseId === caseId; }) || null;
};

window.KuBi.caseForAppointment = function (appt) {
  return appt ? window.KuBi.caseById(appt.caseId) : null;
};

/**
 * Stage by stage, as it stands. Today's appointment wins where there is
 * one, because that is the live record staff are moving; otherwise the
 * case's own last known progress is used. Never both.
 */
window.KuBi.caseStageList = function (caseId, appointments) {
  const c = window.KuBi.caseById(caseId);
  if (!c) return [];
  const appt = window.KuBi.appointmentForCase(caseId, appointments);

  if (appt && appt.caseStages && appt.caseStages.length) {
    return appt.caseStages.map(function (s) {
      return { name: s.name, done: !!s.done, current: !!s.current };
    });
  }
  const done = c.stagesDone || [];
  let currentTaken = false;
  return c.stages.map(function (name) {
    const isDone = done.indexOf(name) !== -1;
    const isCurrent = !isDone && !currentTaken;
    if (isCurrent) currentTaken = true;
    return { name: name, done: isDone, current: isCurrent };
  });
};

/** Where the case has reached: what is finished, what is now, what is next. */
window.KuBi.caseProgress = function (caseId, appointments) {
  const stages = window.KuBi.caseStageList(caseId, appointments);
  const completed = stages.filter(function (s) { return s.done; }).map(function (s) { return s.name; });
  const currentStage = stages.find(function (s) { return s.current; });
  const idx = currentStage ? stages.indexOf(currentStage) : -1;
  const next = idx >= 0 ? stages.slice(idx + 1).find(function (s) { return !s.done; }) : null;
  return {
    stages: stages,
    completed: completed,
    current: currentStage ? currentStage.name : null,
    next: next ? next.name : null,
    visitsDone: completed.length,
    visitsTotal: stages.length,
    allStagesDone: stages.length > 0 && completed.length === stages.length,
  };
};

// ---- what the case is waiting on --------------------------------------

/** The lab work for this case, whichever appointment it was booked under. */
window.KuBi.caseLab = function (caseId, labReceived) {
  const cases = window.KuBi.labCases(labReceived);
  return cases.filter(function (c) { return c.caseId === caseId; });
};

window.KuBi.caseFollowUp = function (caseId) {
  return (window.KuBi.FOLLOW_UPS || []).find(function (f) { return f.caseId === caseId; }) || null;
};

/**
 * The three states the blueprint asks KuBi to stop confusing:
 *
 *   treatmentDone   today's procedure is finished
 *   visitDocumented today's visit has been written up  (V1's "case closed")
 *   caseClosed      every stage is done AND the last visit is documented
 *
 * V1 called the middle one "case closed" because it was keyed by
 * appointment. It never meant the case was over.
 */
window.KuBi.caseClosure = function (caseId, ctx) {
  const c = ctx || {};
  const appt = window.KuBi.appointmentForCase(caseId, c.appointments);
  const proc = (c.procedureState || {})[appt ? appt.id : ''] || null;
  const visitDocumented = !!(appt && (c.closedCases || {})[appt.id]);
  const progress = window.KuBi.caseProgress(caseId, c.appointments);
  const followUp = window.KuBi.caseFollowUp(caseId);

  return {
    treatmentDone: !!(proc && proc.completedAt),
    visitDocumented: visitDocumented,
    // A case with an unfinished stage is not closed, however well today's
    // visit was written up.
    caseClosed: progress.allStagesDone && (!appt || visitDocumented),
    followUp: followUp,
    followUpDue: !!(followUp && window.KuBi.isOverdue(followUp)),
  };
};

/**
 * The whole thread, assembled: Patient → Case → Stage → Visit → Closure.
 * One call, so a screen never has to gather this itself and no two screens
 * can gather it differently.
 */
window.KuBi.caseThread = function (caseId, ctx) {
  const c = window.KuBi.caseById(caseId);
  if (!c) return null;
  const context = ctx || {};
  const appt = window.KuBi.appointmentForCase(caseId, context.appointments);
  return {
    caseId: c.caseId,
    patient: c.patient,
    procedureType: c.procedureType,
    treatment: c.treatment,
    diagnosis: c.diagnosis,
    today: appt,                                   // null when nobody is booked in
    progress: window.KuBi.caseProgress(caseId, context.appointments),
    lab: window.KuBi.caseLab(caseId, context.labReceived),
    closure: window.KuBi.caseClosure(caseId, context),
  };
};

/** Cases still open, longest-stalled first — the ones with work left. */
window.KuBi.openCases = function (ctx) {
  return window.KuBi.allCases()
    .map(function (c) { return window.KuBi.caseThread(c.caseId, ctx); })
    .filter(function (t) { return t && !t.closure.caseClosed; });
};
