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
    history: [
      { on: _caseDay(-7), kind: 'caseOpened',         by: 'Dr. Ananya Rao' },
      { on: _caseDay(-7), kind: 'diagnosisConfirmed', by: 'Dr. Ananya Rao' },
      { on: _caseDay(-5), kind: 'stageCompleted',     by: 'Dr. Ananya Rao', stage: 'Cleaning' },
    ],
  },
  'MR0184-CROWN_SINGLE-01': {
    caseId: 'MR0184-CROWN_SINGLE-01', patient: 'Meera Reddy',
    procedureType: 'Crown', treatment: 'Crown delivery',
    diagnosis: 'Fractured cusp, 46',
    history: [
      { on: _caseDay(-21), kind: 'caseOpened',         by: 'Dr. Karan Mehta' },
      { on: _caseDay(-21), kind: 'diagnosisConfirmed', by: 'Dr. Karan Mehta' },
      { on: _caseDay(-14), kind: 'stageCompleted',     by: 'Dr. Karan Mehta', stage: 'Preparation' },
      { on: _caseDay(-6),  kind: 'stageCompleted',     by: 'Dr. Karan Mehta', stage: 'Try-in' },
    ],
  },
  'KS0502-SCALING-01': {
    caseId: 'KS0502-SCALING-01', patient: 'Kabir Singh',
    procedureType: 'Scaling', treatment: 'Scaling and polish',
    diagnosis: 'Generalised gingivitis',
    history: [
      { on: _caseDay(0), kind: 'caseOpened',         by: 'Dr. Ananya Rao' },
      { on: _caseDay(0), kind: 'diagnosisConfirmed', by: 'Dr. Ananya Rao' },
    ],
  },
  'DN077-IMPLANT_CROWN-01': {
    caseId: 'DN077-IMPLANT_CROWN-01', patient: 'Devika Nair',
    procedureType: 'Implant Prosthesis', treatment: 'Implant review',
    diagnosis: 'Missing 36, implant placed',
    history: [
      { on: _caseDay(-90), kind: 'caseOpened',         by: 'Dr. Karan Mehta' },
      { on: _caseDay(-90), kind: 'diagnosisConfirmed', by: 'Dr. Karan Mehta' },
      { on: _caseDay(-84), kind: 'stageCompleted',     by: 'Dr. Karan Mehta', stage: 'Implant placement' },
    ],
    // Keeps its own list: this plan spans the surgery AND the prosthesis,
    // so it is neither procedure's standard sequence.
    stages: ['Implant placement', 'Healing review', 'Scan / impression', 'Try-in', 'Fitting'],
  },
  // Open, and nobody is booked in today. These are the cases V1 could not
  // see at all.
  'VS0221-CROWN_SINGLE-01': {
    caseId: 'VS0221-CROWN_SINGLE-01', patient: 'Vikram Shah',
    procedureType: 'Crown', treatment: 'Crown, lower right 6',
    diagnosis: 'Root treated 46, needs coverage',
    history: [
      { on: _caseDay(-18), kind: 'caseOpened',         by: 'Dr. Karan Mehta' },
      { on: _caseDay(-18), kind: 'diagnosisConfirmed', by: 'Dr. Karan Mehta' },
      { on: _caseDay(-11), kind: 'stageCompleted',     by: 'Dr. Karan Mehta', stage: 'Preparation' },
    ],
    stagesDone: ['Preparation'],
  },
  'LM0455-RCT_MOLAR-01': {
    caseId: 'LM0455-RCT_MOLAR-01', patient: 'Leela Menon',
    procedureType: 'RCT', treatment: 'Root canal, lower left 7',
    diagnosis: 'Apical periodontitis, 37',
    history: [
      { on: _caseDay(-40), kind: 'caseOpened',         by: 'Dr. Ananya Rao' },
      { on: _caseDay(-40), kind: 'diagnosisConfirmed', by: 'Dr. Ananya Rao' },
      { on: _caseDay(-33), kind: 'stageCompleted',     by: 'Dr. Ananya Rao', stage: 'Cleaning' },
      { on: _caseDay(-26), kind: 'stageCompleted',     by: 'Dr. Ananya Rao', stage: 'Cleaning / medication' },
      { on: _caseDay(-19), kind: 'stageCompleted',     by: 'Dr. Ananya Rao', stage: 'Obturation' },
    ],
    stagesDone: ['Cleaning', 'Cleaning / medication', 'Obturation'],
  },
};

// ---- the timeline ------------------------------------------------------
//
// WHAT EARNS A PLACE
// An entry must be an operational fact with a time and an actor: the case
// opened, a diagnosis confirmed, a stage completed, a visit started,
// finished or written up, lab sent or received, a follow-up booked. That
// is the whole list.
//
// What does NOT earn a place: individual checklist ticks (too many, and
// they are already visible where they are ticked), and clinical detail,
// which is the clinical record's job and not KuBi's. A timeline that
// records everything is a log; staff read a log once and never again.
//
// WHERE ENTRIES COME FROM
// Two sources, and the split is deliberate:
//   · BEFORE today — recorded on the case. In a connected setup this comes
//     from Clinical Suite, which owns the clinical record.
//   · TODAY — DERIVED from live state (procedure timestamps, whether the
//     visit is written up, lab receipt). Nothing is written to produce it,
//     so it cannot drift from what the rest of KuBi believes.
// A real recorded event log is the blueprint's "KuBi memory" and a bigger
// piece; this gives the timeline without pretending to be that yet.

function _caseDay(offset) {
  return window.KuBi.operatingDate(new Date(Date.now() + offset * 86400000));
}

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
 * Stages this case finished on EARLIER days, by the stable (English) name.
 *
 * Three sources, all already recorded: stages imported with the case
 * (stagesDone), stages its history says were completed, and visits KuBi
 * itself kept — a visit only counts once it was finished AND written up.
 */
window.KuBi.casePastStagesDone = function (caseId) {
  const c = window.KuBi.caseById(caseId);
  if (!c) return {};
  const done = {};
  (c.stagesDone || []).forEach(function (n) { done[n] = true; });
  (c.history || []).forEach(function (h) {
    if (h.kind === 'stageCompleted' && h.stage) done[h.stage] = true;
  });
  (window.KuBi.pastVisits ? window.KuBi.pastVisits(caseId) : []).forEach(function (v) {
    if (window.KuBi.visitCompletesStage(v)) done[v.stage] = true;
  });
  return done;
};

/**
 * Stage by stage, as it stands. Today's appointment supplies today's live
 * progress; what earlier days finished is added to it, because an
 * appointment record can lag behind what actually happened — and a stage
 * that was finished and written up on Tuesday is finished, whatever
 * Wednesday's booking still says.
 */
window.KuBi.caseStageList = function (caseId, appointments, lang) {
  const c = window.KuBi.caseById(caseId);
  if (!c) return [];
  const appt = window.KuBi.appointmentForCase(caseId, appointments);
  const past = window.KuBi.casePastStagesDone(caseId);

  // NAMES come from the procedure's template — that is the point of a
  // template — unless this case carries its own list, which a combined
  // plan legitimately does (an implant case that spans surgery AND the
  // prosthesis is not the standard three stages of either).
  const names = (c.stages && c.stages.length)
    ? c.stages
    : window.KuBi.templateStages(c.procedureType, lang);
  // The stable names, which is what past records are kept under; the
  // displayed ones may be translated.
  const keys = (c.stages && c.stages.length) ? c.stages : window.KuBi.templateStages(c.procedureType);

  // Only one stage is "now": the first one not done. If the appointment
  // marked a stage current that earlier days have since finished, the
  // current marker moves on rather than pointing at finished work.
  function settle(list) {
    const anyCurrentOpen = list.some(function (s) { return s.current && !s.done; });
    let taken = false;
    return list.map(function (s) {
      let current = anyCurrentOpen ? (s.current && !s.done) : (!s.done && !taken);
      if (current) { if (taken) current = false; taken = true; }
      return { name: s.name, done: s.done, current: current };
    });
  }

  // PROGRESS comes from today's appointment when there is one. Positions
  // are only trusted when the two agree on how many stages there are;
  // otherwise the appointment is the whole truth, names included, because
  // guessing an alignment would silently mislabel someone's treatment.
  if (appt && appt.caseStages && appt.caseStages.length) {
    if (names.length === appt.caseStages.length) {
      return settle(appt.caseStages.map(function (st, i) {
        return { name: names[i], done: !!st.done || !!past[keys[i]], current: !!st.current };
      }));
    }
    return settle(appt.caseStages.map(function (st) {
      return { name: st.name, done: !!st.done || !!past[st.name], current: !!st.current };
    }));
  }

  return settle(names.map(function (name, i) {
    return { name: name, done: !!past[keys[i]], current: false };
  }));
};

/** Where the case has reached: what is finished, what is now, what is next. */
window.KuBi.caseProgress = function (caseId, appointments, lang) {
  const stages = window.KuBi.caseStageList(caseId, appointments, lang);
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

// ---- visits, across days ----------------------------------------------

/**
 * Every visit the case has had, numbered, oldest first:
 *
 *   Visit 1 · 12 Sep · Case opened
 *   Visit 2 · 14 Sep · Cleaning
 *   Visit 3 · today  · Cleaning / medication
 *
 * A visit is a DAY the patient came in for this case. Earlier days come
 * from the case's own history and from visits KuBi kept; today's is read
 * live. Nobody numbers anything — the count is the dates.
 */
window.KuBi.caseVisitList = function (caseId, ctx) {
  const c = window.KuBi.caseById(caseId);
  if (!c) return [];
  const context = ctx || {};
  const today = window.KuBi.operatingDate();
  const byDate = {};

  // Imported history: one visit per date, named for the stage it finished
  // when it finished one.
  (c.history || []).forEach(function (h) {
    if (!h.on || h.on >= today) return;
    const v = byDate[h.on] || (byDate[h.on] = { on: h.on, stage: null, by: h.by || null,
                                                 completed: true, documented: true, source: 'history' });
    if (h.kind === 'stageCompleted' && h.stage) v.stage = h.stage;
    if (h.kind === 'caseOpened' && !v.stage) v.opened = true;
  });

  // Visits KuBi kept. Where a date is in both, KuBi's own record wins: it
  // has the times.
  window.KuBi.pastVisits(caseId).forEach(function (r) {
    byDate[r.date] = { on: r.date, stage: r.stage, by: r.doctor || r.documentedBy || null,
                       completed: !!r.completedAt, documented: !!r.documentedAt, source: 'kept' };
  });

  // Today, live.
  const appt = window.KuBi.appointmentForCase(caseId, context.appointments);
  if (appt) {
    const live = window.KuBi.visitsFromDay(today, [appt], context.procedureState, context.closedCases)[0];
    if (live && live.attended) {
      byDate[today] = { on: today, stage: live.stage, by: appt.doctor || null, today: true,
                        completed: !!live.completedAt, documented: !!live.documentedAt, source: 'today' };
    }
  }

  return Object.keys(byDate).sort().map(function (d, i) {
    return Object.assign({ n: i + 1 }, byDate[d]);
  });
};

/**
 * The visit that comes next: its number, the stage it is for, and whether
 * the patient is booked for it. A closed case has no next visit — what
 * follows it is a follow-up, which is a different thing.
 */
window.KuBi.caseNextVisit = function (caseId, ctx) {
  const context = ctx || {};
  if (window.KuBi.caseClosure(caseId, context).caseClosed) return null;
  const visits = window.KuBi.caseVisitList(caseId, context);
  const progress = window.KuBi.caseProgress(caseId, context.appointments, context.lang);
  // A patient booked in today is having today's stage today, so the NEXT
  // visit is for the stage after it. With nobody booked today (or a
  // no-show), the stage the case is on is still waiting for its visit.
  const appt = window.KuBi.appointmentForCase(caseId, context.appointments);
  const todayCounts = !!appt && appt.status !== 'no_show';
  const stage = todayCounts ? progress.next : progress.current;
  if (!stage) return null;
  const todayListed = visits.length && visits[visits.length - 1].today;

  const today = window.KuBi.operatingDate();
  const booking = (window.KuBi.UPCOMING || [])
    .filter(function (u) { return u.caseId === caseId && u.date > today; })
    .sort(function (a, b) { return a.date.localeCompare(b.date); })[0] || null;

  const n = visits.length + (todayCounts && !todayListed ? 2 : 1);
  return { n: n, stage: stage, bookedFor: booking ? booking.date : null };
};

// ---- what the case is waiting on --------------------------------------

/** The lab work for this case, whichever appointment it was booked under. */
window.KuBi.caseLab = function (caseId, labReceived) {
  return window.KuBi.labForCase(caseId, labReceived);
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
  const caseClosed = progress.allStagesDone && (!appt || visitDocumented);

  // A follow-up somebody booked wins. Failing that, once the case is
  // closed KuBi works one out from the procedure and the closing date —
  // both already recorded, so nobody is asked to book anything. This is
  // the last link of the chain: close the case, and KuBi knows when the
  // patient is due back.
  const booked = window.KuBi.caseFollowUp(caseId);
  const closedAt = appt && (c.closedCases || {})[appt.id] && (c.closedCases || {})[appt.id].closedAt;
  const followUp = booked || (caseClosed
    ? window.KuBi.derivedFollowUp(window.KuBi.caseById(caseId).procedureType,
                                  closedAt || window.KuBi.operatingDate(), c.lang)
    : null);

  return {
    treatmentDone: !!(proc && proc.completedAt),
    visitDocumented: visitDocumented,
    // A case with an unfinished stage is not closed, however well today's
    // visit was written up.
    caseClosed: caseClosed,
    followUp: followUp,
    followUpDue: window.KuBi.followUpIsDue(followUp),
  };
};

/**
 * The case's history, oldest first: what happened, when, by whom.
 *
 * Read-only. Recorded entries come from the case; today's are derived from
 * live state, so they are never stale and never need writing. The last
 * entry is the stage that has not happened yet, marked as ahead rather
 * than dated — a timeline that ends in the past tells you nothing about
 * what to do.
 */
window.KuBi.caseTimeline = function (caseId, ctx) {
  const c = window.KuBi.caseById(caseId);
  if (!c) return [];
  const context = ctx || {};
  const today = window.KuBi.operatingDate();
  const out = (c.history || []).map(function (h) {
    return { on: h.on, kind: h.kind, by: h.by, stage: h.stage || null };
  });

  // ---- today, derived ----
  const appt = window.KuBi.appointmentForCase(caseId, context.appointments);
  if (appt) {
    const proc = (context.procedureState || {})[appt.id] || {};
    if (proc.startedAt) {
      out.push({ on: today, kind: 'visitStarted', by: proc.startedBy || appt.doctor || null,
                 stage: appt.currentStageName || null });
    }
    if (proc.completedAt) {
      out.push({ on: today, kind: 'visitCompleted', by: proc.startedBy || appt.doctor || null,
                 stage: appt.currentStageName || null });
    }
    const closed = (context.closedCases || {})[appt.id];
    if (closed) {
      out.push({ on: today, kind: 'visitDocumented', by: (closed && closed.closedBy) || null,
                 stage: appt.currentStageName || null });
    }
  }

  // Earlier days KuBi kept. The visit, as it happened: finished, and
  // written up — or, honestly, not.
  window.KuBi.pastVisits(caseId).forEach(function (r) {
    if (r.completedAt) out.push({ on: r.date, kind: 'visitCompleted', by: r.doctor || null, stage: r.stage });
    else out.push({ on: r.date, kind: 'visitStarted', by: r.doctor || null, stage: r.stage });
    if (r.documentedAt) out.push({ on: r.date, kind: 'visitDocumented', by: r.documentedBy || null, stage: r.stage });
    else if (r.completedAt) out.push({ on: r.date, kind: 'visitNotDocumented', by: null, stage: r.stage });
  });

  // Lab movements belong to the case, whichever visit booked them.
  window.KuBi.caseLab(caseId, context.labReceived).forEach(function (l) {
    // The lab is where it went, not who did it — `by` would read as though
    // the lab sent the work to itself.
    if (l.sent) out.push({ on: l.sent, kind: 'labSent', by: null, lab: l.lab || null, stage: null, item: l.item });
    if (l.received && l.due) out.push({ on: l.due, kind: 'labReceived', by: null, lab: l.lab || null, stage: null, item: l.item });
  });

  out.sort(function (a, b) { return String(a.on).localeCompare(String(b.on)); });

  // What has not happened yet, so the timeline points forward — and says
  // whether anybody has booked it, which is the question front desk has.
  const nextVisit = window.KuBi.caseNextVisit(caseId, context);
  if (nextVisit) {
    out.push({ ahead: true, kind: 'nextStage', stage: nextVisit.stage,
               visit: nextVisit.n, bookedFor: nextVisit.bookedFor });
  }
  return out;
};

/**
 * Where the case stands, as one answer. The blueprint asks KuBi to stop
 * confusing three different endings, and this is the order they happen in:
 *
 *   inTreatment    stages remain
 *   treatmentDone  today's procedure is finished, the visit is not written up
 *   closed         every stage done and written up, nothing outstanding
 *   followUpDue    closed, and the patient is due back — the loop
 *   complete       closed, with a follow-up booked for later
 *
 * A follow-up that is due on an OPEN case does not make the case
 * followUpDue: the case has not finished, so the follow-up is part of the
 * treatment rather than the tail of it.
 */
window.KuBi.caseState = function (caseId, ctx) {
  const cl = window.KuBi.caseClosure(caseId, ctx);
  if (!cl.caseClosed) return cl.treatmentDone && !cl.visitDocumented ? 'treatmentDone' : 'inTreatment';
  if (cl.followUpDue) return 'followUpDue';
  return cl.followUp ? 'complete' : 'closed';
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
    progress: window.KuBi.caseProgress(caseId, context.appointments, context.lang),
    lab: window.KuBi.caseLab(caseId, context.labReceived),
    timeline: window.KuBi.caseTimeline(caseId, context),
    visits: window.KuBi.caseVisitList(caseId, context),
    nextVisit: window.KuBi.caseNextVisit(caseId, context),
    closure: window.KuBi.caseClosure(caseId, context),
    state: window.KuBi.caseState(caseId, context),
  };
};

/** Cases still open, longest-stalled first — the ones with work left. */
window.KuBi.openCases = function (ctx) {
  return window.KuBi.allCases()
    .map(function (c) { return window.KuBi.caseThread(c.caseId, ctx); })
    .filter(function (t) { return t && !t.closure.caseClosed; });
};
