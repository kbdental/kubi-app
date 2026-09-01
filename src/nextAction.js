// nextAction.js — the event-driven core. Rather than making staff
// navigate to find out where things stand, KuBi looks at the whole
// clinic and answers two questions:
//
//     What is happening right now?
//     What single action moves it forward?
//
// Priority order matters: a patient sitting in a chair that isn't ready
// outranks a patient still in the waiting room, and both outrank
// paperwork. The first match wins — KuBi says ONE thing, not a list.

window.KuBi = window.KuBi || {};

window.KuBi.nextAction = function (ctx) {
  const appts = ctx.appointments || [];
  const proc = ctx.procedureState || {};
  const closed = ctx.closedCases || {};
  const before = ctx.treatmentChecked || {};
  const after = ctx.treatmentCheckedAfter || {};
  const clinicStatus = ctx.clinicStatus || {};
  const readiness = ctx.readinessChecked || {};
  const equipment = ctx.equipmentStatus || {};
  const sterPacks = ctx.sterPacks || [];
  const labReceived = ctx.labReceived || {};

  // 0. Clinic not open — nothing else matters yet.
  if (!clinicStatus.open) {
    return { kind: 'openClinic', area: 'clinic', subtab: 'opening', owner: 'front_desk_receptionist' };
  }

  // 1. Equipment fault that is stopping work RIGHT NOW.
  //
  //    Not every fault is. A broken chair in room 3 does not stop the
  //    patient sitting in room 1, and treating it as though it did meant
  //    one unfixed fault said the same thing on this card all day —
  //    through arrivals, through treatment, through closing — until
  //    somebody marked it working. A card that never changes stops being
  //    read, which costs more than the fault it was reporting.
  //
  //    So: shared equipment is clinic-wide and still outranks everything.
  //    A chair only outranks patient flow when somebody is in it. Faults
  //    that are not blocking still appear in the attention list, so
  //    nothing is lost — only demoted.
  const equipList = window.KuBi.equipmentList() || [];
  const occupiedChairs = {};
  appts.forEach(function (a) {
    if (a.status === 'in_chair' || a.status === 'in_treatment') occupiedChairs[a.chair] = true;
  });
  function faultIsBlocking(id) {
    const item = equipList.find(function (e) { return e.id === id; });
    if (!item) return true;          // unknown kit: assume it matters
    if (!item.isChair) return true;  // shared equipment is clinic-wide
    return !!occupiedChairs[item.room];
  }
  const brokenId = Object.keys(equipment).filter(function (k) {
    return equipment[k] && equipment[k].ok === false;
  }).find(faultIsBlocking);
  if (brokenId) {
    const item = equipList.find(function (e) { return e.id === brokenId; });
    return {
      kind: 'equipmentDown', equipId: brokenId, equipItem: item,
      note: equipment[brokenId].note || '',
      area: 'clinic', subtab: 'equipment',
      owner: 'lead_dental_assistant',
    };
  }

  // 2. Clinic open but the day's opening readiness is unfinished, and
  //    nothing live is happening yet — the morning gate. Deliberately
  //    below equipment: a broken machine outranks ticking a checklist.
  //    Once patients are moving, patient flow outranks this, and the
  //    room-level checks are picked up by the chair rule further down.
  const liveNow = appts.some(function (a) {
    const p = proc[a.id];
    return a.status === 'arrived' || a.status === 'waiting' ||
           a.status === 'in_chair' || a.status === 'in_treatment' ||
           (p && p.startedAt && !p.completedAt);
  });
  // At the end of the day an unfinished morning list must not stand in
  // front of closing, so this only applies while work remains.
  const workRemains = !appts.length || appts.some(function (a) {
    return a.status !== 'done' && a.status !== 'no_show';
  });
  if (!liveNow && workRemains) {
    const rd = window.KuBi.openingReadinessStats(readiness);
    if (!rd.complete && rd.firstPending) {
      const sec = rd.firstPending.section;
      return {
        kind: 'readinessIncomplete',
        section: sec, room: rd.firstPending.room || null,
        done: rd.done, total: rd.total, pending: rd.pending,
        area: 'clinic',
        subtab: window.KuBi.CLINIC_SUBTAB_OF[sec.id] || 'readiness',
        owner: sec.ownerRole || 'clinic_manager',
      };
    }
  }

  // 3. Someone is mid-procedure — that's the live event.
  const running = appts.find(function (a) {
    const p = proc[a.id];
    return p && p.startedAt && !p.completedAt;
  });
  if (running) {
    return { kind: 'inProgress', appt: running, area: 'treatment', subtab: 'before', apptId: running.id, owner: 'lead_dentist' };
  }

  // 4. Procedure finished but not documented/closed — the gap that
  //    quietly loses records if nobody is prompted.
  const undocumented = appts.find(function (a) {
    const p = proc[a.id];
    if (!(p && p.completedAt) || closed[a.id]) return false;
    return !window.KuBi.closureGate(a.procedureType, after[a.id] || {}).canClose;
  });
  if (undocumented) {
    const gate = window.KuBi.closureGate(undocumented.procedureType, after[undocumented.id] || {});
    const missing = gate.missing.map(function (m) { return m.steps[0]; }).filter(Boolean);
    return { kind: 'needsDocumentation', appt: undocumented, missing: missing, area: 'treatment', subtab: 'after', apptId: undocumented.id, owner: 'lead_dentist' };
  }

  // 5. Supplies missing for a treatment still to come today — a
  //    prerequisite, so checked before anyone is seated.
  const upcoming = appts.filter(function (a) {
    return a.status !== 'done' && a.status !== 'no_show' && !closed[a.id];
  });
  const blockedSupply = upcoming.find(function (a) {
    const sup = window.KuBi.procedureSupplyStatus(a.procedureType, a.id, labReceived);
    return !sup.ok;
  });
  if (blockedSupply) {
    const sup = window.KuBi.procedureSupplyStatus(blockedSupply.procedureType, blockedSupply.id, labReceived);
    return {
      kind: 'supplyMissing', appt: blockedSupply,
      missing: sup.blocking.map(function (m) { return m.name; }),
      labMissing: sup.labMissing,
      area: 'clinic', subtab: 'inventory',
      owner: 'lead_dental_assistant',
    };
  }


  // 6. No sterile packs at all — also a prerequisite.
  const st = window.KuBi.sterStats(sterPacks);
  if (st.total > 0 && st.available === 0 && upcoming.length) {
    const stuck = {};
    sterPacks.forEach(function (p) { if (p.stage !== 'available') stuck[p.stage] = true; });
    let bottleneck = null;
    (window.KuBi.STER_STAGES || []).forEach(function (s2) { if (!bottleneck && stuck[s2]) bottleneck = s2; });
    return {
      kind: 'noSterilePacks', bottleneck: bottleneck, pending: st.pending,
      area: 'clinic', subtab: 'sterilization',
      owner: 'sterilization_technician',
    };
  }


  // 7. Patient in the chair — ready to start, or still missing something.
  const seated = appts.find(function (a) { return a.status === 'in_chair'; });
  if (seated) {
    const stats = window.KuBi.treatmentReadyStats(seated.procedureType, before[seated.id] || {});
    if (stats.ready) {
      return { kind: 'readyToStart', appt: seated, area: 'treatment', subtab: 'before', apptId: seated.id, owner: 'lead_dentist' };
    }
    return { kind: 'notReady', appt: seated, missing: stats.missing, area: 'treatment', subtab: 'before', apptId: seated.id, owner: 'lead_dental_assistant' };
  }

  // 8. No one seated, a patient is waiting, and no chair is ready —
  //     the blocking problem is the room, so say that, not "seat them".
  const anyWaiting = appts.some(function (a) { return a.status === 'arrived' || a.status === 'waiting'; });
  if (anyWaiting) {
    const occupiedNow = {};
    appts.forEach(function (a) { if (a.status === 'in_chair' || a.status === 'in_treatment') occupiedNow[a.chair] = true; });
    const op = window.KuBi.CLINIC_READINESS.filter(function (s) { return s.perRoom; })[0];
    if (op) {
      let anyReady = false;
      let firstUnready = null;
      (window.KuBi.CLINIC_ROOMS || []).forEach(function (room) {
        if (occupiedNow[room]) return;
        const rs = window.KuBi.roomStats(op, room, readiness);
        if (rs.ready) anyReady = true;
        else if (firstUnready === null) firstUnready = room;
      });
      if (!anyReady && firstUnready !== null) {
        return { kind: 'chairNotReady', room: firstUnready, area: 'clinic', subtab: 'equipment', owner: 'lead_dental_assistant' };
      }
    }
  }

  // 9. Someone has arrived and needs a chair.
  const waitingList = appts.filter(function (a) { return a.status === 'arrived' || a.status === 'waiting'; });
  if (waitingList.length) {
    // Offer the first free, ready room if there is one.
    const occupied = {};
    appts.forEach(function (a) { if (a.status === 'in_chair' || a.status === 'in_treatment') occupied[a.chair] = true; });
    const operatory = window.KuBi.CLINIC_READINESS.filter(function (s) { return s.perRoom; })[0];
    let freeReadyRoom = null;
    (window.KuBi.CLINIC_ROOMS || []).forEach(function (room) {
      if (freeReadyRoom || occupied[room]) return;
      if (!operatory) { freeReadyRoom = room; return; }
      if (window.KuBi.roomStats(operatory, room, readiness).ready) freeReadyRoom = room;
    });
    const next = waitingList[0];
    return { kind: 'seatPatient', appt: next, room: freeReadyRoom, area: 'patients', apptId: next.id, owner: 'front_desk_receptionist' };
  }

  // 10. Day's clinical work done — point at closing.
  const anyOpen = appts.some(function (a) {
    return a.status !== 'done' && a.status !== 'no_show';
  });
  if (!anyOpen && appts.length) {
    return { kind: 'readyToClose', area: 'clinic', subtab: 'closing', owner: 'clinic_manager' };
  }

  return { kind: 'allClear' };
};
