// escalation.js — V2.3. What happens to a problem nobody has fixed.
//
//     Problem → owner → action → escalation → resolution
//
// V1 named an owner for every exception, which answers "whose job is
// this". It could not answer the next two questions: how long has it been
// waiting, and who gets told when it keeps waiting. Staff had to decide
// for themselves whom to call, which in practice means nobody is called.
//
// TIME RAISED IS DERIVED, NEVER STORED.
// Every exception already has a natural moment it began: the patient was
// marked waiting, the procedure was completed, the fault was reported, the
// lab date passed. attention.js reads that moment from the same state the
// exception itself comes from. A stored raisedAt would be a second copy of
// a fact, and the first thing to go stale after a reload.
//
// RESOLUTION IS THE PROBLEM GOING AWAY.
// There is deliberately no "resolved" flag to tick. An exception exists
// because a condition is true; when the condition stops being true the
// exception stops being computed. A flag would let a screen say resolved
// while the patient is still sitting in the waiting room.
//
// ⚠ THE TIMES BELOW ARE A STARTING POINT AND NEED THE CLINIC'S SIGN-OFF.
//   The waiting chain follows the blueprint's own example (Front Desk,
//   then the Clinic Manager after 20 minutes, then the Owner after 40).
//   The rest are proportionate to how much harm the delay does, which is
//   a judgement the clinic should make rather than accept.

window.KuBi = window.KuBi || {};

// Who holds a problem, and who hears about it if it is still open later.
// `after` is minutes since the problem began. The first entry is always
// the person whose job it is; later entries are who else needs to know.
window.KuBi.ESCALATION = {
  waitingTooLong: [
    { after: 0, role: 'front_desk_receptionist' },
    { after: 20, role: 'clinic_manager' },
    { after: 40, role: 'owner_admin' },
  ],
  noShow: [
    { after: 0, role: 'front_desk_receptionist' },
    { after: 60, role: 'clinic_manager' },
  ],
  treatmentNotReady: [
    { after: 0, role: 'lead_dental_assistant' },
    { after: 15, role: 'lead_dentist' },
    { after: 30, role: 'clinic_manager' },
  ],
  roomNotReady: [
    { after: 0, role: 'lead_dental_assistant' },
    { after: 30, role: 'clinic_manager' },
  ],
  caseNotClosed: [
    { after: 0, role: 'lead_dentist' },
    { after: 120, role: 'clinic_manager' },
    { after: 480, role: 'owner_admin' },
  ],
  equipmentDown: [
    { after: 0, role: 'lead_dental_assistant' },
    { after: 60, role: 'clinic_manager' },
    { after: 240, role: 'owner_admin' },
  ],
  labLate: [
    { after: 0, role: 'front_desk_receptionist' },
    { after: 1440, role: 'clinic_manager' },      // still not here the next day
    { after: 4320, role: 'owner_admin' },         // three days
  ],
  repairOpen: [
    { after: 0, role: 'clinic_manager' },
    { after: 4320, role: 'owner_admin' },
  ],
};

/** How long this problem has been going on, in whole minutes. */
window.KuBi.exceptionAgeMinutes = function (item, now) {
  if (!item || !item.raisedAt) return 0;
  const then = new Date(item.raisedAt).getTime();
  const at = (now ? new Date(now) : new Date()).getTime();
  return Math.max(0, Math.floor((at - then) / 60000));
};

/**
 * Where this problem has got to: who holds it now, how long it has been
 * open, and who hears next if it stays open.
 *
 * An exception with no chain stays with the role that raised it. That is
 * a deliberate fallback rather than an error: a new kind of exception
 * should still name somebody, not nobody.
 */
window.KuBi.exceptionEscalation = function (item, now) {
  const chain = window.KuBi.ESCALATION[item && item.kind] || [];
  const age = window.KuBi.exceptionAgeMinutes(item, now);

  if (!chain.length) {
    return { level: 0, owner: (item && item.owner) || null, ageMinutes: age,
             escalated: false, nextRole: null, nextInMinutes: null };
  }

  let level = 0;
  for (let i = 0; i < chain.length; i++) {
    if (age >= chain[i].after) level = i;
  }
  const next = chain[level + 1] || null;
  return {
    level: level,
    owner: chain[level].role,
    ageMinutes: age,
    escalated: level > 0,
    nextRole: next ? next.role : null,
    nextInMinutes: next ? Math.max(0, next.after - age) : null,
  };
};

/** The whole chain for a kind, for showing what will happen if nothing does. */
window.KuBi.escalationChain = function (kind) {
  return (window.KuBi.ESCALATION[kind] || []).slice();
};
