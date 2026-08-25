// history.js — persistent daily records for MIS trends.
//
// STORAGE ADAPTER
// KuBi runs in environments where browser storage is unavailable, so all
// persistence goes through one small adapter. Today it holds records in
// memory (they reset on reload). To make history real, replace ONLY the
// adapter — e.g. point it at Google Sheets, the same way Attendance is
// planned to work. Nothing else in the app needs to change.
//
// CAPTURE POLICY
// A day is captured when the clinic is CLOSED — that is the only moment
// the day's figures are final. A rolling snapshot is also kept during the
// day so that if a day is never formally closed, the last known state is
// still filed (flagged `closedProperly: false`) rather than lost.

window.KuBi = window.KuBi || {};

window.KuBi.historyStore = (function () {
  let records = {};   // date -> snapshot
  let rolling = null; // today's live snapshot, not yet committed

  return {
    // Replace these four methods to swap in real storage.
    all: function () {
      return Object.keys(records).map(function (d) { return records[d]; });
    },
    get: function (date) { return records[date] || null; },
    put: function (snapshot) { records[snapshot.date] = snapshot; },
    remove: function (date) { delete records[date]; },

    // Rolling (uncommitted) snapshot of the current day.
    setRolling: function (s) { rolling = s; },
    getRolling: function () { return rolling; },
  };
})();

// Build a snapshot of the day from live state. Pure function — the same
// inputs MIS already uses, reduced to the figures worth keeping.
window.KuBi.buildSnapshot = function (ctx, closedProperly) {
  const d = window.KuBi.misToday(ctx);
  const readiness = window.KuBi.readinessStats(ctx.readinessChecked || {});
  const counts = window.KuBi.attendanceCounts();
  const attention = window.KuBi.computeAttentionItems(
    ctx.appointments, ctx.treatmentCheckedAfter, ctx.readinessChecked,
    ctx.clinicStatus, ctx.procedureState, ctx.closedCases, ctx.treatmentChecked
  );

  return {
    date: window.KuBi.operatingDate(),
    closedProperly: !!closedProperly,
    booked: d.booked,
    arrived: d.arrived,
    completed: d.completed,
    noShow: d.noShow,
    treatmentsFinished: d.finished,
    casesClosed: d.casesClosed,
    readinessPct: readiness.pct,
    avgWait: d.avgWait,
    maxWait: d.maxWait,
    staffPresent: counts.Present + counts.Late,
    staffTotal: counts.Present + counts.Late + counts.Absent,
    exceptions: attention.length,
    docPending: d.docPending,
  };
};

// Commit today's snapshot. Called when the clinic is closed.
window.KuBi.captureDay = function (ctx, closedProperly) {
  const snap = window.KuBi.buildSnapshot(ctx, closedProperly);
  window.KuBi.historyStore.put(snap);
  return snap;
};

// Keep the rolling snapshot current, and file any earlier unclosed day.
window.KuBi.touchRolling = function (ctx) {
  const today = window.KuBi.operatingDate();
  const prev = window.KuBi.historyStore.getRolling();

  // A new day has begun and the previous one was never closed — file it
  // with what we last knew, flagged as not properly closed.
  if (prev && prev.date !== today && !window.KuBi.historyStore.get(prev.date)) {
    window.KuBi.historyStore.put(Object.assign({}, prev, { closedProperly: false }));
  }

  window.KuBi.historyStore.setRolling(window.KuBi.buildSnapshot(ctx, false));
};

// ---- Trends -----------------------------------------------------------
// Returns null when there isn't enough history — the UI must then show
// "no history yet" rather than a misleading number.
window.KuBi.trend = function (field, days) {
  const today = window.KuBi.operatingDate();
  const cutoff = window.KuBi.operatingDate(new Date(Date.now() - days * 86400000));

  const vals = window.KuBi.historyStore.all()
    .filter(function (s) { return s.date >= cutoff && s.date < today; })
    .map(function (s) { return s[field]; })
    .filter(function (v) { return typeof v === 'number'; });

  if (!vals.length) return null;
  const avg = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
  return { avg: Math.round(avg * 10) / 10, days: vals.length };
};

// How many complete days are on file — used to decide whether trends can
// be shown at all.
window.KuBi.historyDepth = function () {
  return window.KuBi.historyStore.all().length;
};

// ---- Period aggregation ----------------------------------------------
// Count metrics sum over the period; rate metrics average. A total
// waiting time would be meaningless, so the two are treated differently.
window.KuBi.MIS_COUNT_FIELDS = ['booked', 'arrived', 'completed', 'noShow', 'treatmentsFinished', 'casesClosed', 'exceptions', 'docPending'];
window.KuBi.MIS_RATE_FIELDS = ['readinessPct', 'avgWait', 'maxWait', 'staffPresent', 'staffTotal'];

window.KuBi.PERIODS = ['today', 'yesterday', 'week', 'month'];

// Which stored days fall inside a period. 'today' returns nothing here —
// today's figures come from live state, not history.
window.KuBi.daysInPeriod = function (period) {
  const all = window.KuBi.historyStore.all();
  const today = window.KuBi.operatingDate();

  if (period === 'yesterday') {
    const y = window.KuBi.operatingDate(new Date(Date.now() - 86400000));
    return all.filter(function (s) { return s.date === y; });
  }
  if (period === 'week') {
    const cutoff = window.KuBi.operatingDate(new Date(Date.now() - 7 * 86400000));
    return all.filter(function (s) { return s.date >= cutoff && s.date < today; });
  }
  if (period === 'month') {
    const cutoff = window.KuBi.operatingDate(new Date(Date.now() - 30 * 86400000));
    return all.filter(function (s) { return s.date >= cutoff && s.date < today; });
  }
  return [];
};

// Aggregate a period into the same shape as a single day's snapshot, so
// the UI can render it without knowing which period it is looking at.
// Returns null when the period holds no data.
window.KuBi.aggregatePeriod = function (period) {
  const days = window.KuBi.daysInPeriod(period);
  if (!days.length) return null;

  const out = { date: period, dayCount: days.length };

  window.KuBi.MIS_COUNT_FIELDS.forEach(function (f) {
    out[f] = days.reduce(function (sum, d) { return sum + (typeof d[f] === 'number' ? d[f] : 0); }, 0);
  });

  window.KuBi.MIS_RATE_FIELDS.forEach(function (f) {
    const vals = days.map(function (d) { return d[f]; }).filter(function (v) { return typeof v === 'number'; });
    out[f] = vals.length ? Math.round((vals.reduce(function (a, b) { return a + b; }, 0) / vals.length) * 10) / 10 : null;
  });

  return out;
};

// Is a period selectable? Today always is; the rest need stored days.
window.KuBi.periodAvailable = function (period) {
  if (period === 'today') return true;
  return window.KuBi.daysInPeriod(period).length > 0;
};
