// mis.js — management information, derived entirely from live state.
//
// Everything computed HERE is today-only: each figure is read from the
// day's own appointments, procedure state, closed cases and checklists,
// so it cannot disagree with what staff are looking at. Past periods come
// from history.js, and only when days are actually on file — with none,
// the UI says "no history yet" rather than inventing an average.
//
// One exception, and it is not operational: the staff Present/Late/Absent
// figures come from window.KuBi.ATTENDANCE, a fixed list with no way to
// record attendance from inside KuBi. They cannot move whatever the clinic
// does, and they are written into every stored day. A journey check asserts
// this so the day it becomes real, the check fails and says so.

window.KuBi = window.KuBi || {};

window.KuBi.misToday = function (ctx) {
  const appts = ctx.appointments || [];
  const proc = ctx.procedureState || {};
  const closed = ctx.closedCases || {};
  const after = ctx.treatmentCheckedAfter || {};
  const before = ctx.treatmentChecked || {};

  const booked = appts.length;
  const noShow = appts.filter(function (a) { return a.status === 'no_show'; }).length;
  const arrivedStates = ['arrived', 'waiting', 'in_chair', 'in_treatment', 'done'];
  const arrived = appts.filter(function (a) { return arrivedStates.indexOf(a.status) !== -1; }).length;
  const inChair = appts.filter(function (a) { return ['in_chair', 'in_treatment', 'done'].indexOf(a.status) !== -1; }).length;
  const completed = appts.filter(function (a) { return a.status === 'done'; }).length;
  const late = appts.filter(function (a) { return a.status === 'late'; }).length;

  const started = appts.filter(function (a) { return proc[a.id] && proc[a.id].startedAt; }).length;
  const finished = appts.filter(function (a) { return proc[a.id] && proc[a.id].completedAt; }).length;
  const running = appts.filter(function (a) { return proc[a.id] && proc[a.id].startedAt && !proc[a.id].completedAt; }).length;
  const casesClosed = appts.filter(function (a) { return closed[a.id]; }).length;

  const notReady = appts.filter(function (a) {
    if (['in_chair', 'in_treatment'].indexOf(a.status) === -1) return false;
    return !window.KuBi.treatmentReadyStats(a.procedureType, before[a.id] || {}).ready;
  }).length;

  const docPending = appts.filter(function (a) {
    if (!(proc[a.id] && proc[a.id].completedAt) || closed[a.id]) return false;
    return !window.KuBi.closureGate(a.procedureType, after[a.id] || {}).canClose;
  }).length;

  // Waiting times, from the moment a patient was marked waiting.
  const now = Date.now();
  const waits = [];
  appts.forEach(function (a) {
    if (a.status === 'waiting' && a.statusAt) {
      waits.push(Math.floor((now - new Date(a.statusAt).getTime()) / 60000));
    }
  });
  const avgWait = waits.length ? Math.round(waits.reduce(function (s, w) { return s + w; }, 0) / waits.length) : null;
  const maxWait = waits.length ? Math.max.apply(null, waits) : null;

  return {
    booked: booked, arrived: arrived, inChair: inChair, completed: completed,
    noShow: noShow, late: late,
    started: started, finished: finished, running: running, casesClosed: casesClosed,
    notReady: notReady, docPending: docPending,
    avgWait: avgWait, maxWait: maxWait,
    carriedForward: booked - completed - noShow,
  };
};

// Per-treatment-type breakdown for today.
window.KuBi.misByTreatment = function (ctx) {
  const appts = ctx.appointments || [];
  const proc = ctx.procedureState || {};
  const closed = ctx.closedCases || {};
  const rows = {};
  appts.forEach(function (a) {
    const key = a.procedureType || '—';
    if (!rows[key]) rows[key] = { type: key, planned: 0, completed: 0, pending: 0 };
    rows[key].planned++;
    const done = !!closed[a.id] || (proc[a.id] && proc[a.id].completedAt);
    if (done && closed[a.id]) rows[key].completed++;
    else if (a.status !== 'no_show') rows[key].pending++;
  });
  return Object.keys(rows).map(function (k) { return rows[k]; });
};

// Clinic-area readiness, one line per CLINIC sub-tab.
window.KuBi.misClinicAreas = function (ctx) {
  const readiness = ctx.readinessChecked || {};
  const equipment = ctx.equipmentStatus || {};
  const sterPacks = ctx.sterPacks || [];
  const appts = ctx.appointments || [];
  const clinicStatus = ctx.clinicStatus || {};
  const closingChecked = ctx.closingChecked || {};

  const out = [];

  out.push({ area: 'opening', ok: !!clinicStatus.open, note: clinicStatus.open ? null : 'notOpen' });

  // Operatories: all rooms ready?
  const op = window.KuBi.CLINIC_READINESS.filter(function (s) { return s.perRoom; })[0];
  if (op) {
    const unready = (window.KuBi.CLINIC_ROOMS || []).filter(function (r) {
      return !window.KuBi.roomStats(op, r, readiness).ready;
    });
    out.push({ area: 'operatories', ok: unready.length === 0, count: unready.length });
  }

  const broken = Object.keys(equipment).filter(function (k) { return equipment[k] && equipment[k].ok === false; });
  out.push({ area: 'equipment', ok: broken.length === 0, count: broken.length });

  const st = window.KuBi.sterStats(sterPacks);
  out.push({ area: 'sterilization', ok: st.pending === 0, count: st.pending });

  const shortages = appts.filter(function (a) {
    return !window.KuBi.procedureSupplyStatus(a.procedureType, a).ok;
  });
  // Low stock warns but doesn't block — surface it so it isn't invisible.
  const lowStock = (window.KuBi.MATERIALS || []).filter(function (m) { return m.state === 'low'; });
  out.push({ area: 'inventory', ok: shortages.length === 0, count: shortages.length, warn: lowStock.length });

  // Housekeeping sections are the non-per-room readiness sections owned
  // by front desk / housekeeping.
  const hkSections = window.KuBi.CLINIC_READINESS.filter(function (s) {
    return window.KuBi.CLINIC_SUBTAB_OF[s.id] === 'housekeeping';
  });
  let hkTotal = 0, hkDone = 0;
  hkSections.forEach(function (s) {
    s.groups.forEach(function (g, gi) {
      g.tasks.forEach(function (t, ti) {
        hkTotal++;
        if (readiness[window.KuBi.taskKey(s, gi, ti, null)]) hkDone++;
      });
    });
  });
  out.push({ area: 'housekeeping', ok: hkTotal > 0 && hkDone === hkTotal, count: hkTotal - hkDone });

  const cl = window.KuBi.closingStats(closingChecked);
  out.push({ area: 'closing', ok: cl.canClose, pending: !clinicStatus.open, count: cl.blocking.length });

  return out;
};

// Role-wise checklist execution — who was assigned work and how much of
// it is done. Not performance scoring; just operational fact.
window.KuBi.misByRole = function (ctx) {
  const readiness = ctx.readinessChecked || {};
  const rows = {};

  window.KuBi.CLINIC_READINESS.forEach(function (section) {
    const role = section.ownerRole;
    if (!role) return; // all-staff sections aren't attributable
    if (!rows[role]) rows[role] = { role: role, total: 0, done: 0 };
    const rooms = section.perRoom ? (window.KuBi.CLINIC_ROOMS || [null]) : [null];
    rooms.forEach(function (room) {
      section.groups.forEach(function (g, gi) {
        g.tasks.forEach(function (t, ti) {
          rows[role].total++;
          if (readiness[window.KuBi.taskKey(section, gi, ti, room)]) rows[role].done++;
        });
      });
    });
  });

  return Object.keys(rows).map(function (k) {
    const r = rows[k];
    r.pending = r.total - r.done;
    return r;
  });
};

window.KuBi.MIS_NO_HISTORY = '—';

// Waiting times, from the status timestamps KuBi already records.
window.KuBi.misWaiting = function (appointments) {
  const now = Date.now();
  const waits = [];
  (appointments || []).forEach(function (a) {
    if (!a.statusAt) return;
    if (['waiting', 'in_chair', 'in_treatment', 'done'].indexOf(a.status) === -1) return;
    const mins = Math.floor((now - new Date(a.statusAt).getTime()) / 60000);
    if (mins >= 0 && mins < 600) waits.push(mins);
  });
  if (!waits.length) return { count: 0, avg: null, longest: null };
  const sum = waits.reduce(function (x, y) { return x + y; }, 0);
  return { count: waits.length, avg: Math.round(sum / waits.length), longest: Math.max.apply(null, waits) };
};
