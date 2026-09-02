// followUp.js — the loop from a closed case back to a patient in the chair.
//
//     Due → Contact → Booked → Attended → Closed
//
// WHAT STAFF ARE ASKED FOR, AND WHY IT IS ONLY ONE THING
// The V2 principle is that KuBi should not ask for more information, it
// should use what is already entered. Applied here:
//
//   Due       the date is already known — derived
//   Contact   nothing in KuBi implies somebody picked up a phone. This is
//             the ONE entry, and it is one tap.
//   Booked    if the patient is in the diary, KuBi already knows — derived
//   Attended  if they turned up, KuBi already knows — derived
//   Closed    attended, or somebody said it is finished — derived
//
// So a follow-up moves itself along as the clinic works, and the only thing
// anybody records is the call they actually made.

window.KuBi = window.KuBi || {};

window.KuBi.FOLLOWUP_STATES = ['notYetDue', 'due', 'contacted', 'booked', 'attended', 'closed'];

// Having called somebody buys a pause, not silence. If the call led
// nowhere and no appointment was made, the follow-up comes back.
window.KuBi.CONTACT_GRACE_DAYS = 2;

function _progress(ctx, id) {
  return ((ctx && ctx.followUpProgress) || {})[id] || {};
}

function _daysSince(when) {
  if (!when) return null;
  const then = new Date(when).getTime();
  return Math.floor((Date.now() - then) / 86400000);
}

/** Is this patient in the diary, on or after today? */
window.KuBi.followUpBooking = function (f, ctx) {
  const today = window.KuBi.operatingDate();
  const c = ctx || {};

  // Today's list first: a patient booked in today is booked.
  const todayAppt = (c.appointments || []).find(function (a) {
    return (f.caseId && a.caseId === f.caseId) || a.patient === f.patient;
  });
  if (todayAppt) return { date: today, appt: todayAppt };

  const ahead = (window.KuBi.UPCOMING || []).filter(function (u) {
    if (u.date < today) return false;
    return (f.caseId && u.caseId === f.caseId) || u.patient === f.patient;
  }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  return ahead.length ? { date: ahead[0].date, appt: null } : null;
};

/** Did they actually come? */
window.KuBi.followUpAttended = function (f, ctx) {
  const attendedStates = ['arrived', 'waiting', 'in_chair', 'in_treatment', 'done'];
  return ((ctx && ctx.appointments) || []).some(function (a) {
    const mine = (f.caseId && a.caseId === f.caseId) || a.patient === f.patient;
    return mine && attendedStates.indexOf(a.status) !== -1;
  });
};

/**
 * Where this follow-up has got to. Derived from the diary and the day,
 * except for the one recorded fact: that somebody called.
 */
window.KuBi.followUpState = function (f, ctx) {
  if (!f) return null;
  const p = _progress(ctx, f.id);
  if (p.dismissedAt) return 'closed';
  if (window.KuBi.followUpAttended(f, ctx)) return 'attended';
  if (window.KuBi.followUpBooking(f, ctx)) return 'booked';
  if (p.contactedAt) return 'contacted';
  return window.KuBi.followUpIsDue(f) ? 'due' : 'notYetDue';
};

/**
 * Does this still need chasing? Only when nobody has done anything about
 * it — or when a call led nowhere and the grace has run out.
 *
 * A patient who is booked, or who has turned up, is not chased. Chasing
 * somebody who is sitting in the waiting room is how a list stops being
 * believed.
 */
window.KuBi.followUpNeedsChasing = function (f, ctx) {
  const state = window.KuBi.followUpState(f, ctx);
  if (state === 'due') return true;
  if (state !== 'contacted') return false;
  const since = _daysSince(_progress(ctx, f.id).contactedAt);
  return since !== null && since >= window.KuBi.CONTACT_GRACE_DAYS;
};

/** Everything about one follow-up, assembled for a screen. */
window.KuBi.followUpThread = function (f, ctx) {
  const p = _progress(ctx, f.id);
  const booking = window.KuBi.followUpBooking(f, ctx);
  return {
    id: f.id,
    patient: f.patient,
    reason: f.reason,
    due: f.due,
    caseId: f.caseId || null,
    state: window.KuBi.followUpState(f, ctx),
    contactedAt: p.contactedAt || null,
    contactedBy: p.contactedBy || null,
    outcome: p.outcome || null,
    bookedFor: booking ? booking.date : null,
    needsChasing: window.KuBi.followUpNeedsChasing(f, ctx),
    overdue: window.KuBi.isOverdue(f),
  };
};

/** Every follow-up, soonest due first, with where each has got to. */
window.KuBi.followUpThreads = function (ctx) {
  return (window.KuBi.FOLLOW_UPS || [])
    .map(function (f) { return window.KuBi.followUpThread(f, ctx); })
    .sort(function (a, b) { return String(a.due).localeCompare(String(b.due)); });
};
