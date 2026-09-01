// history.js — persistent daily records for MIS trends.
//
// STORAGE ADAPTER
// KuBi runs in environments where browser storage is unavailable, so all
// persistence goes through one small adapter. It keeps every record in
// memory and, when a Google Sheet is configured in sheetsSync.js, mirrors
// that memory to the sheet: read once on load, write through on change.
//
// Reads stay synchronous because MIS calls them while rendering. The
// network cannot be synchronous, so the sheet hydrates in the background
// and listeners are notified when it lands — that is what subscribe() is
// for, and it is the only thing outside this file that had to change.
//
// With no sheet configured the adapter behaves exactly as it always did:
// records live for the session and MIS honestly reports no history.
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
  let listeners = [];
  let pending = [];   // writes the sheet has not accepted yet
  let hydrated = false;

  function notify() {
    listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { /* a bad listener must not break storage */ }
    });
  }

  function sync() { return window.KuBi.historySync; }

  // Retry anything the sheet has not taken yet. Order is preserved, and a
  // write that fails again goes back on the queue rather than being lost.
  function flush() {
    if (!sync().isConfigured() || !pending.length) return Promise.resolve();
    const queue = pending;
    pending = [];
    return queue.reduce(function (chain, job) {
      return chain.then(function () {
        const attempt = job.op === 'remove'
          ? sync().remove(job.date)
          : sync().save(job.snapshot);
        return attempt.then(function (ok) { if (!ok) pending.push(job); });
      });
    }, Promise.resolve());
  }

  function queue(job) {
    if (!sync().isConfigured()) return Promise.resolve(false);
    const attempt = job.op === 'remove'
      ? sync().remove(job.date)
      : sync().save(job.snapshot);
    return attempt.then(function (ok) {
      if (!ok) pending.push(job);
      return ok;
    });
  }

  return {
    // The four storage methods. Reads answer from memory; writes update
    // memory first so the UI never waits on the network, then go to the
    // sheet.
    all: function () {
      return Object.keys(records).map(function (d) { return records[d]; });
    },
    get: function (date) { return records[date] || null; },
    put: function (snapshot) {
      records[snapshot.date] = snapshot;
      notify();
      return queue({ op: 'put', snapshot: snapshot });
    },
    remove: function (date) {
      delete records[date];
      notify();
      return queue({ op: 'remove', date: date });
    },

    // Rolling (uncommitted) snapshot of the current day.
    setRolling: function (s) { rolling = s; },
    getRolling: function () { return rolling; },

    // ---- sheet mirror ------------------------------------------------
    // Read the sheet once and merge it in. Anything written locally wins:
    // it is either newer than the sheet or still queued for it.
    hydrate: function () {
      if (!sync().isConfigured()) return Promise.resolve(false);
      return sync().load().then(function (rows) {
        if (!rows) return false;
        const merged = {};
        rows.forEach(function (r) { if (r && r.date) merged[r.date] = r; });
        Object.keys(records).forEach(function (d) { merged[d] = records[d]; });
        records = merged;
        hydrated = true;
        notify();
        return flush().then(function () { return true; });
      });
    },

    // Re-render hook for anything that reads history while rendering.
    subscribe: function (fn) {
      listeners.push(fn);
      return function () {
        listeners = listeners.filter(function (l) { return l !== fn; });
      };
    },

    // Visible state, for tests and for deciding what MIS may claim.
    state: function () {
      return {
        configured: sync().isConfigured(),
        hydrated: hydrated,
        pending: pending.length,
        count: Object.keys(records).length,
      };
    },

    flush: flush,

    // Test seam: forget everything, including listeners and queue.
    reset: function () {
      records = {}; rolling = null; listeners = []; pending = []; hydrated = false;
    },
  };
})();

// Pull the sheet in as soon as the app loads. Fire and forget — if there
// is no sheet, no internet, or no answer, MIS simply shows no history.
if (window.KuBi.historySync && window.KuBi.historySync.isConfigured()) {
  window.KuBi.historyStore.hydrate();
}

// Build a snapshot of the day from live state. Pure function — the same
// inputs MIS already uses, reduced to the figures worth keeping.
window.KuBi.buildSnapshot = function (ctx, closedProperly) {
  const d = window.KuBi.misToday(ctx);
  const readiness = window.KuBi.readinessStats(ctx.readinessChecked || {});
  const counts = window.KuBi.attendanceCounts();
  const attention = window.KuBi.computeAttentionItems(
    ctx.appointments, ctx.treatmentCheckedAfter, ctx.readinessChecked,
    ctx.clinicStatus, ctx.procedureState, ctx.closedCases, ctx.treatmentChecked, ctx.repairs, ctx.labReceived, ctx.equipmentStatus
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

    // WHICH problems, not just how many. A day that stored only "7" tells
    // you nothing two months later about whether it is always Chair 3.
    // This is the field that makes "what keeps going wrong" answerable,
    // and history you did not record cannot be recovered afterwards.
    exceptionKinds: attention.reduce(function (acc, it) {
      acc[it.kind] = (acc[it.kind] || 0) + 1;
      return acc;
    }, {}),

    // What the day left behind. Cases do not end when the clinic closes.
    casesOpen: window.KuBi.openCases(ctx).length,
    followUpsDue: window.KuBi.followUpsDue().length,
  };
};

// ---- what keeps going wrong -------------------------------------------
// Counts every kind of exception across the stored days, with the number
// of DAYS it appeared on as well as the total. A fault that happened nine
// times on one bad Tuesday is a different problem from one that happens
// once a day, every day, and the two need different answers.
window.KuBi.repeatingProblems = function (days) {
  const today = window.KuBi.operatingDate();
  const cutoff = window.KuBi.operatingDate(new Date(Date.now() - (days || 30) * 86400000));
  const rows = window.KuBi.historyStore.all().filter(function (s) {
    return s.date >= cutoff && s.date < today;
  });

  const tally = {};
  rows.forEach(function (s) {
    const kinds = s.exceptionKinds || {};
    Object.keys(kinds).forEach(function (k) {
      if (!tally[k]) tally[k] = { kind: k, total: 0, days: 0 };
      tally[k].total += kinds[k];
      if (kinds[k] > 0) tally[k].days += 1;
    });
  });

  return Object.keys(tally)
    .map(function (k) { return tally[k]; })
    .sort(function (a, b) { return b.days - a.days || b.total - a.total; });
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
// casesOpen and followUpsDue are a state of the day, not a tally of it:
// summing "7 cases open" across a week would be meaningless, so they
// average like the other rates.
window.KuBi.MIS_RATE_FIELDS = ['readinessPct', 'avgWait', 'maxWait', 'staffPresent', 'staffTotal',
                              'casesOpen', 'followUpsDue'];

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
