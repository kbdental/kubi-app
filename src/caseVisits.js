// caseVisits.js — a case remembers its visits from one day to the next.
//
//     Visit 1 → Visit 2 → Visit 3 → next
//
// THE GAP THIS CLOSES
// Everything about today's visit lives in the day: who was seated, when the
// procedure started and finished, whether it was written up. The day is
// stored per date, so at midnight today's work leaves the case's view — a
// root canal finished on Tuesday was, by Wednesday, simply gone from the
// case, and the case still said "Cleaning / medication: now".
//
// NOTHING NEW IS ENTERED
// A visit is not something staff record. It is read off the day as it
// happens (visitsFromDay) and kept, one small row per case per date. The
// V2 principle, applied: KuBi already knows the patient was in the chair,
// that the procedure finished and that it was written up. Asking anybody
// to say so a second time would be the app's failure, not theirs.
//
// WHAT IS KEPT, AND WHAT IS NOT
// Case id, date, stage, the three timestamps, and who. No patient name and
// no clinical detail: the case id is enough to join back to the case, and
// the visits tab should hold nothing the clinical record does not need it
// to. (SECURITY.md: the day row holds names; this tab does not.)
//
// TODAY IS ALWAYS LIVE
// Today's visit is derived from today's state every time it is asked for.
// The stored copy of today only matters from tomorrow on. That way a
// morning mistake (a patient marked seated, then no-show) can never leave a
// visit behind that did not happen — the stored row is overwritten with
// `attended: false`, and the live answer never read it anyway.

window.KuBi = window.KuBi || {};

// Seated or beyond. Arrived-and-waiting is not a visit yet: a patient who
// leaves from the waiting room did not have one.
const _ATTENDED_STATUSES = { in_chair: true, in_treatment: true, done: true };

function _visitKey(caseId, date) { return caseId + '|' + date; }

/**
 * The stage today's visit is for, under the name the case's stage list
 * uses — so a visit recorded today can mark the right stage done later.
 *
 * The appointment names its current stage in its own words ("Final
 * fitting"); the case's list may come from the template. Positions are
 * only trusted when the two lists are the same length, as in caseStageList.
 */
window.KuBi.caseStageKey = function (appt) {
  if (!appt) return null;
  const stages = appt.caseStages || [];
  const idx = stages.findIndex(function (s) { return s.current; });
  const c = window.KuBi.caseById ? window.KuBi.caseById(appt.caseId) : null;
  if (c && idx >= 0) {
    const names = (c.stages && c.stages.length) ? c.stages : window.KuBi.templateStages(c.procedureType);
    if (names.length === stages.length) return names[idx];
  }
  return appt.currentStageName || (idx >= 0 ? stages[idx].name : null);
};

/**
 * Visits as the day shows them. Pure: same day in, same visits out.
 * One per case appointment; `attended` says whether it counts.
 */
window.KuBi.visitsFromDay = function (date, appointments, procedureState, closedCases) {
  return (appointments || []).filter(function (a) { return a && a.caseId; }).map(function (a) {
    const proc = (procedureState || {})[a.id] || {};
    const closed = (closedCases || {})[a.id] || null;
    const attended = !!(proc.startedAt || _ATTENDED_STATUSES[a.status] || closed);
    const iso = function (v) { return v ? new Date(v).toISOString() : null; };
    return {
      key: _visitKey(a.caseId, date),
      caseId: a.caseId,
      date: date,
      apptId: a.id,
      stage: window.KuBi.caseStageKey(a),
      doctor: a.doctor || null,
      attended: attended,
      startedAt: iso(proc.startedAt),
      completedAt: iso(proc.completedAt),
      // No closing time on file: the date will do. Never "now" — a value
      // that changes on every call would make the visit look new each time.
      documentedAt: closed ? (iso(closed.closedAt) || date) : null,
      documentedBy: (closed && closed.closedBy) || null,
    };
  });
};

/** A visit that finished AND was written up. Only these complete a stage. */
window.KuBi.visitCompletesStage = function (v) {
  return !!(v && v.attended && v.completedAt && v.documentedAt && v.stage);
};

// ---- the store ---------------------------------------------------------
// Same shape as historyStore: memory first, the sheet mirrored behind it,
// failed writes held and retried rather than dropped.
window.KuBi.caseVisitStore = (function () {
  let records = {};      // key -> visit
  let listeners = [];
  let pending = {};      // key -> visit the sheet has not accepted yet
  let hydrated = false;

  function sync() { return window.KuBi.historySync; }
  function notify() {
    listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* keep going */ } });
  }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  function send(v) {
    if (!sync() || !sync().isConfigured()) return Promise.resolve(false);
    return sync().visitPut(v).then(function (ok) {
      if (ok) { if (pending[v.key] === v) delete pending[v.key]; }
      else pending[v.key] = v;
      return ok;
    });
  }

  return {
    all: function () { return Object.keys(records).map(function (k) { return records[k]; }); },
    forCase: function (caseId) {
      return this.all().filter(function (v) { return v.caseId === caseId; })
        .sort(function (a, b) { return a.date.localeCompare(b.date); });
    },
    get: function (caseId, date) { return records[_visitKey(caseId, date)] || null; },

    /** Upsert. An unchanged visit is not sent again. */
    put: function (v) {
      if (!v || !v.key) return Promise.resolve(false);
      if (same(records[v.key], v)) return Promise.resolve(true);
      records[v.key] = v;
      notify();
      return send(v);
    },

    /**
     * Store what the day shows. A visit that never happened is only
     * written when a row for it already exists — to overwrite it — so a
     * normal day adds rows for real visits and nothing else.
     */
    recordDay: function (date, appointments, procedureState, closedCases) {
      const self = this;
      const jobs = window.KuBi.visitsFromDay(date, appointments, procedureState, closedCases)
        .filter(function (v) { return v.attended || records[v.key]; })
        .map(function (v) { return self.put(v); });
      return Promise.all(jobs);
    },

    hydrate: function () {
      if (!sync() || !sync().isConfigured()) return Promise.resolve(false);
      return sync().visitsAll().then(function (rows) {
        if (!rows) return false;
        const merged = {};
        rows.forEach(function (r) { if (r && r.key) merged[r.key] = r; });
        // Local wins: it is newer, or still waiting to go.
        Object.keys(records).forEach(function (k) { merged[k] = records[k]; });
        records = merged;
        hydrated = true;
        notify();
        return window.KuBi.caseVisitStore.flush().then(function () { return true; });
      });
    },

    flush: function () {
      const queue = Object.keys(pending).map(function (k) { return pending[k]; });
      return Promise.all(queue.map(send));
    },

    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
    },

    state: function () {
      return { hydrated: hydrated, count: Object.keys(records).length,
               pending: Object.keys(pending).length };
    },

    reset: function () { records = {}; listeners = []; pending = {}; hydrated = false; },
  };
})();

/**
 * Visits on days BEFORE today, for one case, oldest first. Today's is
 * never read from here — see the note at the top.
 */
window.KuBi.pastVisits = function (caseId) {
  const today = window.KuBi.operatingDate();
  return window.KuBi.caseVisitStore.forCase(caseId).filter(function (v) {
    return v.date < today && v.attended;
  });
};
