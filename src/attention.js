// attention.js — single source of truth for "what needs attention right
// now", surfaced on TODAY. There is deliberately no Exceptions module:
// problems are surfaced where they occur and link straight to the fix.
//
// Fixed thresholds per the clinic's SOP: waiting >15 min is flagged;
// no-shows always flag. Each item carries the area it belongs to and
// enough context (apptId, subtab, room) to jump directly to the problem.

window.KuBi = window.KuBi || {};

window.KuBi.computeAttentionItems = function (appointments, treatmentCheckedAfter, readinessChecked, clinicStatus, procedureState, closedCases, treatmentChecked) {
  const items = [];
  const now = Date.now();
  const afterChecked = treatmentCheckedAfter || {};
  const beforeChecked = treatmentChecked || {};
  const readiness = readinessChecked || {};
  const procState = procedureState || {};
  const closed = closedCases || {};

  // Who is responsible for fixing each kind of problem. Front desk owns
  // patient flow; the DA owns chair readiness and pre-treatment checks;
  // the dentist owns clinical records.
  const OWNER = {
    roomNotReady: 'lead_dental_assistant',
    waitingTooLong: 'front_desk_receptionist',
    noShow: 'front_desk_receptionist',
    treatmentNotReady: 'lead_dental_assistant',
    caseNotClosed: 'lead_dentist',
  };

  // ---- CLINIC: rooms not ready ----------------------------------------
  // Only flag rooms once the clinic is actually open — before opening,
  // "not ready" is simply the normal starting state, not a problem.
  if (clinicStatus && clinicStatus.open) {
    const operatory = window.KuBi.CLINIC_READINESS.filter(function (s) { return s.perRoom; });
    operatory.forEach(function (section) {
      window.KuBi.CLINIC_ROOMS.forEach(function (room) {
        const rs = window.KuBi.roomStats(section, room, readiness);
        if (!rs.ready) {
          items.push({
            id: 'room-' + section.id + '-' + room,
            area: 'clinic', subtab: 'equipment', room: room,
            kind: 'roomNotReady', room_no: room, done: rs.done, total: rs.total,
            owner: section.ownerRole || OWNER.roomNotReady,
          });
        }
      });
    });
  }

  // ---- PATIENTS & TREATMENT -------------------------------------------
  appointments.forEach(function (a) {
    if (a.status === 'waiting' && a.statusAt) {
      const minutes = Math.floor((now - new Date(a.statusAt).getTime()) / 60000);
      if (minutes > 15) {
        items.push({ id: 'wait-' + a.id, area: 'patients', apptId: a.id, kind: 'waitingTooLong', patient: a.patient, minutes: minutes, owner: OWNER.waitingTooLong });
      }
    }

    if (a.status === 'no_show') {
      items.push({ id: 'noshow-' + a.id, area: 'patients', apptId: a.id, kind: 'noShow', patient: a.patient, owner: OWNER.noShow });
    }

    // Patient in the chair but the before-checklist isn't satisfied —
    // someone is sitting in a chair that isn't ready for them.
    if (a.status === 'in_chair') {
      const before = window.KuBi.treatmentReadyStats(a.procedureType, beforeChecked[a.id] || {});
      if (!before.ready) {
        items.push({ id: 'notready-' + a.id, area: 'treatment', apptId: a.id, subtab: 'before', kind: 'treatmentNotReady', patient: a.patient, missing: before.missing, owner: OWNER.treatmentNotReady });
      }
    }

    // Procedure finished but the case was never closed — this is where
    // documentation quietly goes missing.
    const proc = procState[a.id];
    if (proc && proc.completedAt && !closed[a.id]) {
      const gate = window.KuBi.closureGate(a.procedureType, afterChecked[a.id] || {});
      if (!gate.canClose) {
        items.push({ id: 'postop-' + a.id, area: 'treatment', apptId: a.id, subtab: 'after', kind: 'caseNotClosed', patient: a.patient, procedure: a.procedureType, owner: OWNER.caseNotClosed });
      }
    }
  });

  return items;
};
