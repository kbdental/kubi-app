// attention.js — single source of truth for "what needs attention right
// now", surfaced on TODAY. There is deliberately no Exceptions module:
// problems are surfaced where they occur and link straight to the fix.
//
// Fixed thresholds per the clinic's SOP: waiting >15 min is flagged;
// no-shows always flag. Each item carries the area it belongs to and
// enough context (apptId, subtab, room) to jump directly to the problem.

window.KuBi = window.KuBi || {};

// Waiting longer than this is an exception, per the clinic's SOP.
const WAIT_LIMIT_MIN = 15;

window.KuBi.computeAttentionItems = function (appointments, treatmentCheckedAfter, readinessChecked, clinicStatus, procedureState, closedCases, treatmentChecked, repairs, labReceived, equipmentStatus) {
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
    repairOpen: 'clinic_manager',
    labLate: 'front_desk_receptionist',
    equipmentDown: 'lead_dental_assistant',
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
            raisedAt: clinicStatus.at || null,
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
        items.push({ id: 'wait-' + a.id, area: 'patients', apptId: a.id, kind: 'waitingTooLong', patient: a.patient, minutes: minutes, owner: OWNER.waitingTooLong,
                   raisedAt: new Date(new Date(a.statusAt).getTime() + WAIT_LIMIT_MIN * 60000) });
      }
    }

    if (a.status === 'no_show') {
      items.push({ id: 'noshow-' + a.id, area: 'patients', apptId: a.id, kind: 'noShow', patient: a.patient, owner: OWNER.noShow,
                   raisedAt: a.statusAt || null });
    }

    // Patient in the chair but the before-checklist isn't satisfied —
    // someone is sitting in a chair that isn't ready for them.
    if (a.status === 'in_chair') {
      const before = window.KuBi.treatmentReadyStats(a.procedureType, beforeChecked[a.id] || {});
      if (!before.ready) {
        items.push({ id: 'notready-' + a.id, area: 'treatment', apptId: a.id, subtab: 'before', kind: 'treatmentNotReady', patient: a.patient, missing: before.missing, owner: OWNER.treatmentNotReady,
                     raisedAt: a.statusAt || null });
      }
    }

    // Procedure finished but the case was never closed — this is where
    // documentation quietly goes missing.
    const proc = procState[a.id];
    if (proc && proc.completedAt && !closed[a.id]) {
      const gate = window.KuBi.closureGate(a.procedureType, afterChecked[a.id] || {});
      if (!gate.canClose) {
        items.push({ id: 'postop-' + a.id, area: 'treatment', apptId: a.id, subtab: 'after', kind: 'caseNotClosed', patient: a.patient, procedure: a.procedureType, owner: OWNER.caseNotClosed,
                     raisedAt: proc.completedAt || null });
      }
    }
  });

  // ---- CLINIC: equipment that is not working ---------------------------
  // Every open fault, whether or not it is what the NOW card is showing.
  // The card names the one thing to do next; this is the list of what is
  // wrong, and a fault demoted from the card must not disappear with it.
  const equip = equipmentStatus || {};
  const equipList = window.KuBi.equipmentList() || [];
  Object.keys(equip).forEach(function (id) {
    if (!equip[id] || equip[id].ok !== false) return;
    const item = equipList.find(function (e) { return e.id === id; });
    items.push({
      id: 'equip-' + id, area: 'clinic', subtab: 'equipment',
      room: item && item.isChair ? item.room : null,
      kind: 'equipmentDown', equipItem: item, note: equip[id].note || '',
      owner: OWNER.equipmentDown,
      raisedAt: equip[id].at || null,
    });
  });

  // ---- LAB: promised, and still not here ------------------------------
  // Chased on the day it was promised, not on the day the patient turns
  // up for it — by then it is too late to be useful.
  window.KuBi.labCases(labReceived).forEach(function (c) {
    if (!window.KuBi.labIsLate(c)) return;
    items.push({
      id: 'lab-' + c.apptId, area: 'patients', subtab: 'lab',
      kind: 'labLate', patient: c.patient, item: c.item, due: c.due,
      owner: OWNER.labLate,
      // The promise was for the end of that day, so lateness starts the
      // morning after it.
      raisedAt: new Date(c.due + 'T09:00:00'),
    });
  });

  // ---- BUILDING: a fault nobody has fixed -----------------------------
  // Only once it is overdue. A tap reported an hour ago is being dealt
  // with; one still dripping two days later is not.
  window.KuBi.repairsByAge(repairs || []).forEach(function (r) {
    if (!window.KuBi.repairIsOverdue(r)) return;
    items.push({
      id: 'repair-' + r.id, area: 'clinic', subtab: 'housekeeping',
      kind: 'repairOpen', what: r.what, place: r.place,
      days: window.KuBi.repairAgeDays(r),
      owner: OWNER.repairOpen,
      raisedAt: r.at || null,
    });
  });

  // Work out where each problem has got to. `owner` becomes whoever holds
  // it NOW rather than who it started with, so every screen that already
  // prints the owner shows the escalation without needing to know about
  // it. The original is kept as raisedOwner for anyone who needs it.
  return items.map(function (it) {
    const esc = window.KuBi.exceptionEscalation(it, now);
    return Object.assign({}, it, {
      raisedOwner: it.owner,
      owner: esc.owner || it.owner,
      escalation: esc,
    });
  });
};
