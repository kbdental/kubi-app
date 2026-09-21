// App.jsx — shell for the 5-area structure: Today, Clinic, Patients,
// Treatment, Management. All cross-cutting state (clinic open/close,
// readiness checklist, appointments, treatment checklists) lives here
// and is shared down, so every area always agrees on the same facts.
// goTo() is the one navigation primitive: it switches area and, when
// given a subtab/apptId, tells the target area what to focus on.

window.KuBi = window.KuBi || {};

window.KuBi.RoleBadge = function RoleBadge({ roleId, lang }) {
  const role = window.KuBi.getRole(roleId);
  if (!role) return null;
  const color = window.KuBi.CATEGORY_COLORS[role.category];
  const name = (lang === 'hi' && role.name_hi) ? role.name_hi : role.name;
  return (
    <span className="role-badge" style={{ '--badge-color': color }}>
      <span className="role-dot" />
      {name}
    </span>
  );
};

const AREAS = {
  today: { navKey: 'nav.today', component: function () { return window.KuBi.Today; } },
  clinic: { navKey: 'nav.clinic', component: function () { return window.KuBi.Clinic; } },
  patients: { navKey: 'nav.patients', component: function () { return window.KuBi.Patients; } },
  treatment: { navKey: 'nav.treatment', component: function () { return window.KuBi.Treatment; } },
  management: { navKey: 'nav.management', component: function () { return window.KuBi.Management; } },
};

function LangToggle({ lang, setLang }) {
  return (
    <div className="lang-toggle">
      <button className={lang === 'en' ? 'lang-btn lang-btn-active' : 'lang-btn'} onClick={function () { setLang('en'); }}>EN</button>
      <button className={lang === 'hi' ? 'lang-btn lang-btn-active' : 'lang-btn'} onClick={function () { setLang('hi'); }}>हिं</button>
    </div>
  );
}

function LoginScreen({ onLogin, lang, setLang, feed }) {
  const t = window.KuBi.t;
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState('');
  const [who, setWho] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const connected = window.KuBi.isConnected();

  // Connected: a name, then that person's Management Suite PIN, checked on
  // the server. Management PINs belong to a ROLE and are shared, so a PIN
  // alone cannot say who someone is. The demo PINs are never accepted here.
  const people = connected
    ? (window.KuBi.EMPLOYEES || []).filter(function (e) { return e.role; })
        .slice().sort(function (a, b) { return a.name.localeCompare(b.name); })
    : [];

  function submit(e) {
    e.preventDefault();
    if (!connected) {
      const emp = window.KuBi.EMPLOYEES.find(function (x) { return x.pin === pin; });
      if (emp) { onLogin(emp); } else { setError(t('login.error', lang)); }
      return;
    }
    if (!who) { setError(t('login.pickName', lang)); return; }
    setBusy(true);
    window.KuBi.signInConnected(who, pin).then(function (res) {
      setBusy(false);
      if (res.ok && res.person) { onLogin(res.person); return; }
      setPin('');
      setError(t('login.reason.' + (res.reason || 'wrongPin'), lang));
    });
  }

  if (connected && (!feed || feed.status === 'loading' || feed.status === 'off') && !people.length) {
    return (
      <div className="login-wrap">
        <LangToggle lang={lang} setLang={setLang} />
        <div className="login-card">
          <div className="brand"><div className="brand-mark">Ku</div><div className="brand-name">KuBi</div></div>
          <p className="module-sub">{t('login.connecting', lang)}</p>
        </div>
      </div>
    );
  }
  if (connected && !people.length) {
    return (
      <div className="login-wrap">
        <LangToggle lang={lang} setLang={setLang} />
        <div className="login-card">
          <div className="brand"><div className="brand-mark">Ku</div><div className="brand-name">KuBi</div></div>
          <div className="field-error">{t('login.noStaff', lang)}</div>
          <button className="btn-primary" onClick={function () { window.KuBi.clinicFeed.load(); }}>
            {t('login.retry', lang)}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <LangToggle lang={lang} setLang={setLang} />
      <div className="login-card">
        <div className="brand">
          <div className="brand-mark">Ku</div>
          <div>
            <div className="brand-name">KuBi</div>
            <div className="brand-sub">{t('app.brandSub', lang)}</div>
          </div>
        </div>
        <form onSubmit={submit}>
          {connected ? (
            <React.Fragment>
              <label className="field-label" htmlFor="who">{t('login.yourName', lang)}</label>
              <select id="who" className="pin-input login-name" value={who}
                      onChange={function (e) { setWho(e.target.value); setError(''); }}>
                <option value="">{t('login.pickName', lang)}</option>
                {people.map(function (p) { return <option key={p.id} value={p.name}>{p.name}</option>; })}
              </select>
            </React.Fragment>
          ) : null}
          <label className="field-label" htmlFor="pin">{t('login.enterPin', lang)}</label>
          <input
            id="pin"
            className="pin-input"
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={function (e) { setPin(e.target.value); setError(''); }}
            autoFocus
          />
          {error ? <div className="field-error">{error}</div> : null}
          <button className="btn-primary" type="submit" disabled={busy}>
            {busy ? t('login.checking', lang) : t('login.signIn', lang)}
          </button>
        </form>
        <div className="build-stamp build-stamp-login">{window.KuBi.BUILD_STAMP}</div>
      </div>
    </div>
  );
}

// The whole clinic day. It lives in App, ABOVE the login gate, because
// Shell unmounts the moment somebody signs out — and a clinic shares one
// terminal. When housekeeping hands over to the front desk, the clinic
// must still be open and the morning checklist still ticked. Only `user`
// changes at a shift change; the day does not.
function useClinicDay() {
  const [clinicStatus, setClinicStatus] = React.useState({ open: false, by: null, at: null });
  const [readinessChecked, setReadinessChecked] = React.useState({}); // key -> { by, at }
  const [appointments, setAppointments] = React.useState(window.KuBi.APPOINTMENTS_TODAY);
  const [treatmentChecked, setTreatmentChecked] = React.useState({}); // apptId -> { stepIdx: bool }
  const [treatmentCheckedAfter, setTreatmentCheckedAfter] = React.useState({}); // apptId -> { stepIdx: bool }
  const [closingChecked, setClosingChecked] = React.useState({}); // closing item id -> bool
  // Procedure execution state, per appointment:
  // { startedAt, startedBy, completedAt } — the middle layer between
  // READY and COMPLETED. Deliberately just timestamps, not a checklist.
  const [procedureState, setProcedureState] = React.useState({});
  // Closed cases: apptId -> { closedAt, closedBy }
  const [closedCases, setClosedCases] = React.useState({});
  // Equipment status: id -> { ok, note, at, by }. Manual, per the clinic's
  // preference — derived status would hide real faults behind checkboxes.
  const [equipmentStatus, setEquipmentStatus] = React.useState(window.KuBi.EQUIPMENT_STATUS_SEED || {});
  const [repairs, setRepairs] = React.useState(window.KuBi.REPAIRS_SEED || []);
  const [labReceived, setLabReceived] = React.useState({});
  const [audit, setAudit] = React.useState([]);
  const [followUpProgress, setFollowUpProgress] = React.useState({});
  const [sterPacks, setSterPacks] = React.useState(window.KuBi.STER_PACKS || []);

  const day = {
    clinicStatus: clinicStatus, setClinicStatus: setClinicStatus,
    readinessChecked: readinessChecked, setReadinessChecked: setReadinessChecked,
    appointments: appointments, setAppointments: setAppointments,
    treatmentChecked: treatmentChecked, setTreatmentChecked: setTreatmentChecked,
    treatmentCheckedAfter: treatmentCheckedAfter, setTreatmentCheckedAfter: setTreatmentCheckedAfter,
    closingChecked: closingChecked, setClosingChecked: setClosingChecked,
    procedureState: procedureState, setProcedureState: setProcedureState,
    closedCases: closedCases, setClosedCases: setClosedCases,
    equipmentStatus: equipmentStatus, setEquipmentStatus: setEquipmentStatus,
    repairs: repairs, setRepairs: setRepairs,
    labReceived: labReceived, setLabReceived: setLabReceived,
    audit: audit, setAudit: setAudit,
    followUpProgress: followUpProgress, setFollowUpProgress: setFollowUpProgress,
    sterPacks: sterPacks, setSterPacks: setSterPacks,
  };

  // ---- keeping the day across a refresh -------------------------------
  // Two rules hold this together:
  //
  //   1. Never write before reading. On load the state is seed data. If a
  //      save fired first it would overwrite a real day with the seed —
  //      the exact accident this feature exists to prevent. So saving is
  //      armed only once the read has come back, one way or the other.
  //
  //   2. Never treat unreachable as empty. A failed read leaves the seed
  //      in place and leaves saving DISARMED, so a clinic with no internet
  //      keeps working in memory and cannot clobber the stored day when
  //      the connection returns.
  const armed = React.useRef(false);
  const saveTimer = React.useRef(null);
  const rev = React.useRef(null);          // the revision this browser last saw
  const retryAt = React.useRef(0);         // how long to wait after a failure
  const inFlight = React.useRef(false);    // one save at a time, always
  // Who is signed in, for "saved by". The day lives ABOVE the login gate,
  // so it cannot see the user directly — App tells it. A change nobody
  // made (appointments arriving from the Clinical Suite before anyone signs
  // in) is saved as KuBi's own.
  const savedBy = React.useRef(null);
  // Staff must be able to SEE that saving is failing. A silent retry is
  // how a clinic works all afternoon and finds out at closing that
  // nothing was stored.
  const [saveState, setSaveState] = React.useState({ status: 'idle', at: null, since: null });

  React.useEffect(function () {
    if (!window.KuBi.historySync.isConfigured()) return;
    let cancelled = false;
    window.KuBi.historySync.dayLoad(window.KuBi.operatingDate()).then(function (result) {
      if (cancelled) return;
      if (result === null) return;            // unreachable: stay in memory, stay disarmed
      // Reached the sheet. Either it holds today, or it holds nothing yet —
      // both mean writing is safe. Only the first restores anything.
      if (window.KuBi.dayIsForToday(result.record)) {
        // A day saved while KuBi ran on demo data holds demo repairs,
        // faults and packs. Connected, it is not restored — those would
        // raise alerts about things that never happened — but its revision
        // is still taken, so the next save replaces it cleanly.
        if (window.KuBi.dayRestorable(result.record.state)) window.KuBi.restoreDay(day, result.record.state);
        rev.current = result.record.rev === undefined ? null : result.record.rev;
      } else {
        rev.current = null;                   // nothing stored for today yet
      }
      armed.current = true;
    });
    return function () { cancelled = true; };
  }, []);

  // ---- storing it ------------------------------------------------------
  //
  // Three things this has to survive, none of them rare in a clinic:
  //
  //   ANOTHER TERMINAL WROTE FIRST. The write is refused rather than
  //   winning, because winning would delete somebody's work. The stored day
  //   is merged with this one — every tick and every audit entry from both
  //   sides — and written back on the revision we were just handed.
  //
  //   THE CONNECTION DROPPED. The save is retried, backing off, rather than
  //   waiting for the next time somebody happens to tick something. A quiet
  //   clinic must not be a clinic that silently stops saving.
  //
  //   TWO SAVES AT ONCE. Only one is ever in flight; the day is written
  //   whole, so overlapping writes would race each other.
  const DEBOUNCE_MS = 2500;
  const RETRY_MIN_MS = 4000;
  const RETRY_MAX_MS = 60000;

  function storeDay() {
    if (inFlight.current) return Promise.resolve();
    inFlight.current = true;
    setSaveState(function (prev) { return Object.assign({}, prev, { status: 'saving' }); });
    const date = window.KuBi.operatingDate();
    const mine = window.KuBi.snapshotDay(day);

    return window.KuBi.historySync.daySave(date, mine, rev.current, savedBy.current || 'KuBi')
      .then(function (res) {
        if (res.ok) {
          rev.current = res.rev;
          retryAt.current = 0;
          setSaveState({ status: 'saved', at: new Date(), since: null });
          return;
        }

        if (res.conflict) {
          // Somebody else saved while we were working. Keep both.
          const merged = window.KuBi.mergeDay(mine, res.record && res.record.state);
          window.KuBi.restoreDay(day, merged);
          rev.current = res.rev;
          return window.KuBi.historySync.daySave(date, merged, res.rev, savedBy.current || 'KuBi')
            .then(function (again) {
              if (again.ok) {
                rev.current = again.rev; retryAt.current = 0;
                setSaveState({ status: 'saved', at: new Date(), since: null });
              } else {
                retryAt.current = RETRY_MIN_MS;          // try the whole thing again shortly
                setSaveState(function (prev) {
                  return { status: 'failing', at: prev.at, since: prev.since || new Date() };
                });
              }
            });
        }

        // Could not be stored. Back off, keep trying, and SAY SO.
        retryAt.current = Math.min(
          retryAt.current ? retryAt.current * 2 : RETRY_MIN_MS, RETRY_MAX_MS);
        setSaveState(function (prev) {
          return { status: 'failing', at: prev.at, since: prev.since || new Date() };
        });
      })
      .then(function () { inFlight.current = false; })
      .catch(function () { inFlight.current = false; retryAt.current = RETRY_MIN_MS; });
  }

  const watched = window.KuBi.DAY_FIELDS.map(function (f) { return day[f]; });
  React.useEffect(function () {
    if (!armed.current || !window.KuBi.historySync.isConfigured()) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(storeDay, DEBOUNCE_MS);
    return function () { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, watched);

  // Closing the browser with work that never reached the sheet is exactly
  // how a day gets lost. The browser will only show its own generic
  // wording, but it is a stop sign, and it is better than silence.
  React.useEffect(function () {
    function warn(e) {
      if (!window.KuBi.historySync.isConfigured()) return;
      if (retryAt.current > 0 || inFlight.current) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    }
    window.addEventListener('beforeunload', warn);
    return function () { window.removeEventListener('beforeunload', warn); };
  }, []);

  // A failed save is not left waiting for somebody to tick something else.
  React.useEffect(function () {
    if (!window.KuBi.historySync.isConfigured()) return;
    const timer = setInterval(function () {
      if (armed.current && retryAt.current > 0 && !inFlight.current) storeDay();
    }, RETRY_MIN_MS);
    return function () { clearInterval(timer); };
  }, []);

  // ---- today's appointments come from the Clinical Suite ---------------
  // Every time the feed answers, the list and each status are taken from
  // it, with KuBi's own two facts laid on top (in treatment, written up).
  // The refs let the merge see the current KuBi state without the feed
  // subscription being torn down on every tick.
  const procRef = React.useRef(procedureState);
  const closedRef = React.useRef(closedCases);
  procRef.current = procedureState;
  closedRef.current = closedCases;
  React.useEffect(function () {
    function pull() {
      const f = window.KuBi.clinicFeed.data();
      if (!f || !f.sources || !f.sources.clinical || !f.sources.clinical.ok) return;
      setAppointments(function (prev) {
        const next = window.KuBi.mergeFeedAppointments(f.appointments, prev, procRef.current, closedRef.current);
        return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
      });
    }
    pull();
    return window.KuBi.clinicFeed.subscribe(pull);
  }, []);

  // ---- the case outlives the day ----------------------------------------
  // Each case visit is read off the day as it happens and kept, so tomorrow
  // the case still knows what today did to it. Nothing is entered for this.
  //
  // Same first rule as the day: never write before reading. Until the day
  // has come back from the sheet, the state on screen is seed data, and a
  // visit recorded from seed data would be a visit that never happened.
  const [, setVisitsSeen] = React.useState(0);
  React.useEffect(function () {
    const store = window.KuBi.caseVisitStore;
    const off = store.subscribe(function () { setVisitsSeen(function (n) { return n + 1; }); });
    store.hydrate();
    return off;
  }, []);
  React.useEffect(function () {
    if (window.KuBi.historySync.isConfigured() && !armed.current) return;
    window.KuBi.caseVisitStore.recordDay(window.KuBi.operatingDate(),
                                         appointments, procedureState, closedCases);
  }, [appointments, procedureState, closedCases, saveState.status]);

  // The day, plus whether it is actually reaching the sheet.
  day.saveState = saveState;
  day.setSavedBy = function (name) { savedBy.current = name || null; };
  return day;
}

function Shell({ user, onLogout, lang, setLang, day, feed }) {
  const t = window.KuBi.t;
  const access = window.KuBi.AREA_ACCESS[user.role] || [];
  const [activeArea, setActiveArea] = React.useState(access[0]);
  const [navTarget, setNavTarget] = React.useState({ subtab: null, apptId: null, room: null });

  const {
    clinicStatus, setClinicStatus, readinessChecked, setReadinessChecked,
    appointments, setAppointments, treatmentChecked, setTreatmentChecked,
    treatmentCheckedAfter, setTreatmentCheckedAfter, closingChecked, setClosingChecked,
    procedureState, setProcedureState, closedCases, setClosedCases,
    equipmentStatus, setEquipmentStatus, repairs, setRepairs,
    labReceived, setLabReceived, sterPacks, setSterPacks,
    audit, setAudit,
    followUpProgress, setFollowUpProgress,
  } = day;
  const saveState = day.saveState || { status: 'idle' };

  const ActiveComponent = activeArea ? AREAS[activeArea].component() : null;

  // Keep a live snapshot of the day so nothing is lost if the clinic is
  // never formally closed. Also files any earlier unclosed day.
  React.useEffect(function () {
    window.KuBi.touchRolling({
      appointments: appointments,
      procedureState: procedureState,
      closedCases: closedCases,
      treatmentChecked: treatmentChecked,
      treatmentCheckedAfter: treatmentCheckedAfter,
      readinessChecked: readinessChecked,
      equipmentStatus: equipmentStatus,
      sterPacks: sterPacks,
      clinicStatus: clinicStatus,
      closingChecked: closingChecked,
      repairs: repairs,
    });
  }, [appointments, procedureState, closedCases, treatmentChecked, treatmentCheckedAfter, readinessChecked, equipmentStatus, sterPacks, clinicStatus, closingChecked, repairs, labReceived]);

  // Every change the clinic makes passes through here on its way to
  // state. Nobody is asked for anything: the actor is whoever is signed
  // in and the time is now.
  function note(area, action, subject, detail) {
    setAudit(function (prev) {
      return window.KuBi.auditAppend(prev, {
        by: user.name, area: area, action: action,
        subject: subject || null, detail: detail || null,
      });
    });
  }

  function goTo(area, subtab, apptId, room) {
    // Every jump in the app goes through here — the NOW card, attention
    // items, chair tiles, journey links. Any of them can name an area this
    // role has no access to (the engine describes the whole clinic, not
    // one person's part of it), and following that would drop somebody
    // into a screen their own sidebar says does not exist. Refuse, rather
    // than half-navigate.
    if (!window.KuBi.canReach(user.role, area)) return;
    setActiveArea(area);
    setNavTarget({ subtab: subtab || null, apptId: apptId || null, room: room || null });
  }

  function openClinic() {
    setClinicStatus({ open: true, by: user.name, at: new Date() });
    note('clinic', 'clinicOpened');
  }
  function closeClinic() {
    // The day's figures are final at close — capture them for MIS trends.
    window.KuBi.captureDay({
      appointments: appointments,
      procedureState: procedureState,
      closedCases: closedCases,
      treatmentChecked: treatmentChecked,
      treatmentCheckedAfter: treatmentCheckedAfter,
      readinessChecked: readinessChecked,
      equipmentStatus: equipmentStatus,
      sterPacks: sterPacks,
      clinicStatus: clinicStatus,
      closingChecked: closingChecked,
      repairs: repairs,
      labReceived: labReceived,
    }, true);
    setClinicStatus({ open: false, by: user.name, at: new Date() });
    setClosingChecked({});
    note('clinic', 'clinicClosed');
  }
  function toggleClosing(itemId) {
    note('closure', closingChecked[itemId] ? 'closingUnchecked' : 'closingChecked', itemId);
    setClosingChecked(function (prev) {
      const next = Object.assign({}, prev);
      next[itemId] = !next[itemId];
      return next;
    });
  }
  function toggleReadiness(key, byName) {
    note('readiness', readinessChecked[key] ? 'readinessUnchecked' : 'readinessChecked', key);
    setReadinessChecked(function (prev) {
      const next = Object.assign({}, prev);
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = { by: byName, at: new Date() };
      }
      return next;
    });
  }
  function setApptStatus(id, status) {
    note('patients', 'statusChanged', id, status);
    setAppointments(function (prev) {
      return prev.map(function (a) { return a.id === id ? Object.assign({}, a, { status: status, statusAt: new Date() }) : a; });
    });
  }
  function startProcedure(apptId) {
    note('treatment', 'procedureStarted', apptId);
    setProcedureState(function (prev) {
      const next = Object.assign({}, prev);
      next[apptId] = { startedAt: new Date(), startedBy: user.name, completedAt: null };
      return next;
    });
    setApptStatus(apptId, 'in_treatment');
  }
  function completeProcedure(apptId) {
    note('treatment', 'procedureCompleted', apptId);
    setProcedureState(function (prev) {
      const next = Object.assign({}, prev);
      const cur = Object.assign({}, next[apptId] || {});
      cur.completedAt = new Date();
      next[apptId] = cur;
      return next;
    });
  }

  function advancePack(packId) {
    note('sterilization', 'packAdvanced', packId);
    setSterPacks(function (prev) {
      return prev.map(function (p) {
        if (p.id !== packId) return p;
        const next = window.KuBi.nextSterStage(p.stage);
        if (!next) return p;
        return Object.assign({}, p, { stage: next, at: new Date(), by: user.name });
      });
    });
  }

  // Repairs live until somebody fixes them, so raising one appends and
  // fixing one stamps it — neither ever removes the record.
  // Keyed by the lab item, not by the visit that sent it — a crown sent at
  // the preparation visit is received before the fitting, which is a
  // different appointment entirely.
  // The only thing a follow-up asks anybody to enter: that a call was
  // made. Booked and attended are read from the diary, so nobody has to
  // tell KuBi twice.
  function recordFollowUpContact(id, outcome) {
    note('patients', 'followUpContacted', id, outcome || null);
    setFollowUpProgress(function (prev) {
      const next = Object.assign({}, prev);
      next[id] = Object.assign({}, next[id], {
        contactedAt: new Date(), contactedBy: user.name, outcome: outcome || null,
      });
      return next;
    });
  }

  function dismissFollowUp(id, why) {
    note('patients', 'followUpClosed', id, why || null);
    setFollowUpProgress(function (prev) {
      const next = Object.assign({}, prev);
      next[id] = Object.assign({}, next[id], {
        dismissedAt: new Date(), dismissedBy: user.name, outcome: why || null,
      });
      return next;
    });
  }

  function markLabReceived(labId) {
    note('inventory', 'labReceived', labId);
    setLabReceived(function (prev) {
      const next = Object.assign({}, prev);
      next[labId] = true;
      return next;
    });
  }

  function reportRepair(kind, place, what) {
    note('exceptions', 'repairReported', place, what);
    setRepairs(function (prev) {
      return prev.concat([{
        id: 'R' + (prev.length + 1) + '-' + prev.length,
        kind: kind, place: place, what: what,
        by: user.name, at: new Date(), done: false, doneAt: null,
      }]);
    });
  }
  function markRepairFixed(id) {
    note('exceptions', 'repairFixed', id);
    setRepairs(function (prev) {
      return prev.map(function (r) {
        return r.id === id ? Object.assign({}, r, { done: true, doneAt: new Date() }) : r;
      });
    });
  }

  // The parameter is called `reason` rather than `note`: the audit helper
  // is also called note(), and shadowing it here would silently drop every
  // equipment entry.
  function setEquipment(id, ok, reason) {
    setEquipmentStatus(function (prev) {
      const next = Object.assign({}, prev);
      next[id] = { ok: ok, note: reason || '', at: new Date(), by: user.name };
      return next;
    });
    note('equipment', ok ? 'equipmentWorking' : 'equipmentFault', id, reason || null);
  }

  function closeCase(apptId) {
    note('closure', 'caseClosed', apptId);
    setClosedCases(function (prev) {
      const next = Object.assign({}, prev);
      next[apptId] = { closedAt: new Date(), closedBy: user.name };
      return next;
    });
    setApptStatus(apptId, 'done');
  }

  function toggleTreatmentStep(apptId, stepIdx) {
    note('treatment', 'beforeStepToggled', apptId, String(stepIdx));
    setTreatmentChecked(function (prev) {
      const next = Object.assign({}, prev);
      const apptState = Object.assign({}, next[apptId]);
      apptState[stepIdx] = !apptState[stepIdx];
      next[apptId] = apptState;
      return next;
    });
  }
  function toggleTreatmentStepAfter(apptId, stepIdx) {
    note('treatment', 'afterStepToggled', apptId, String(stepIdx));
    setTreatmentCheckedAfter(function (prev) {
      const next = Object.assign({}, prev);
      const apptState = Object.assign({}, next[apptId]);
      apptState[stepIdx] = !apptState[stepIdx];
      next[apptId] = apptState;
      return next;
    });
  }

  function renderArea() {
    if (!ActiveComponent) return <div className="empty-state">{t('empty.noModules', lang)}</div>;
    if (activeArea === 'today') {
      return (
        <ActiveComponent
          currentUser={user}
          lang={lang}
          clinicStatus={clinicStatus}
          appointments={appointments}
          checked={readinessChecked}
          treatmentChecked={treatmentChecked}
          treatmentCheckedAfter={treatmentCheckedAfter}
          procedureState={procedureState}
          closedCases={closedCases}
          closingChecked={closingChecked}
          equipmentStatus={equipmentStatus}
          sterPacks={sterPacks}
          repairs={repairs}
          labReceived={labReceived}
          followUpProgress={followUpProgress}
          goTo={goTo}
        />
      );
    }
    if (activeArea === 'clinic') {
      return (
        <ActiveComponent
          currentUser={user}
          lang={lang}
          checked={readinessChecked}
          onToggle={toggleReadiness}
          clinicStatus={clinicStatus}
          onOpen={openClinic}
          onClose={closeClinic}
          initialSubtab={navTarget.subtab}
          initialRoom={navTarget.room}
          closingChecked={closingChecked}
          onToggleClosing={toggleClosing}
          equipmentStatus={equipmentStatus}
          onSetEquipment={setEquipment}
          sterPacks={sterPacks}
          onAdvancePack={advancePack}
          repairs={repairs}
          labReceived={labReceived}
          followUpProgress={followUpProgress}
          onReportRepair={reportRepair}
          onRepairFixed={markRepairFixed}
          appointments={appointments}
        />
      );
    }
    if (activeArea === 'patients') {
      return (
        <ActiveComponent
          currentUser={user}
          lang={lang}
          appointments={appointments}
          setStatus={setApptStatus}
          goTo={goTo}
          initialApptId={navTarget.apptId}
          initialSubtab={navTarget.subtab}
          labReceived={labReceived}
          onLabReceived={markLabReceived}
          followUpProgress={followUpProgress}
          onFollowUpContact={recordFollowUpContact}
          onFollowUpClose={dismissFollowUp}
          treatmentChecked={treatmentChecked}
          treatmentCheckedAfter={treatmentCheckedAfter}
          procedureState={procedureState}
          closedCases={closedCases}
        />
      );
    }
    if (activeArea === 'treatment') {
      return (
        <ActiveComponent
          lang={lang}
          appointments={appointments}
          checked={treatmentChecked}
          onToggle={toggleTreatmentStep}
          checkedAfter={treatmentCheckedAfter}
          onToggleAfter={toggleTreatmentStepAfter}
          initialApptId={navTarget.apptId}
          initialSubtab={navTarget.subtab}
          procedureState={procedureState}
          onStartProcedure={startProcedure}
          onCompleteProcedure={completeProcedure}
          closedCases={closedCases}
          onCloseCase={closeCase}
        />
      );
    }
    if (activeArea === 'management') {
      return (
        <ActiveComponent
          lang={lang}
          appointments={appointments}
          treatmentChecked={treatmentChecked}
          treatmentCheckedAfter={treatmentCheckedAfter}
          checked={readinessChecked}
          clinicStatus={clinicStatus}
          procedureState={procedureState}
          closedCases={closedCases}
          equipmentStatus={equipmentStatus}
          sterPacks={sterPacks}
          closingChecked={closingChecked}
          repairs={repairs}
          audit={audit}
          day={day}
          currentUser={user}
          labReceived={labReceived}
          initialSubtab={navTarget.subtab}
          goTo={goTo}
        />
      );
    }
    return null;
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand brand-compact">
          <div className="brand-mark">Ku</div>
          <div className="brand-name">KuBi</div>
        </div>
        <nav>
          {access.map(function (areaId) {
            return (
              <button
                key={areaId}
                className={'nav-item' + (activeArea === areaId ? ' nav-item-active' : '')}
                onClick={function () { setActiveArea(areaId); setNavTarget({ subtab: null, apptId: null, room: null }); }}
              >
                {t(AREAS[areaId].navKey, lang)}
              </button>
            );
          })}
        </nav>
        <div className="build-stamp">{window.KuBi.BUILD_STAMP}</div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="user-chip">
            <div className="avatar">{user.name.split(' ').map(function (p) { return p[0]; }).join('').slice(0, 2)}</div>
            <div>
              <div className="user-name">{user.name}</div>
              <window.KuBi.RoleBadge roleId={user.role} lang={lang} />
            </div>
          </div>
          <div className="topbar-right">
            <span className={'clinic-status-pill ' + (clinicStatus.open ? 'clinic-status-open' : 'clinic-status-closed')}>
              <span className={'status-dot ' + (clinicStatus.open ? 'status-dot-open' : 'status-dot-closed')} />
              {t(clinicStatus.open ? 'today.openLabel' : 'today.closedLabel', lang)}
            </span>
            {/* Whether the day is actually reaching the sheet. Silent
                retrying is how an afternoon's work disappears. */}
            {saveState.status === 'failing' ? (
              <span className="save-pill save-failing" title={t('save.offlineWarn', lang)}>
                🔴 {t('save.failing', lang)}
                {saveState.since ? ' · ' + t('save.since', lang) + ' ' +
                  new Date(saveState.since).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}
              </span>
            ) : saveState.status === 'saved' && saveState.at ? (
              <span className="save-pill save-ok">
                {t('save.saved', lang)} {new Date(saveState.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
            <LangToggle lang={lang} setLang={setLang} />
            <button className="btn-ghost" onClick={onLogout}>{t('topbar.signOut', lang)}</button>
          </div>
        </header>
        {/* The clinic's other apps stopped answering. Said once, plainly,
            with how old what is on screen now is — never hidden behind the
            last answer as if it were current. */}
        {feed && window.KuBi.isConnected() && (feed.status === 'down' || feed.status === 'partial') ? (
          <div className="feed-warning" role="status">
            {(function () {
              const s = feed.sources || {};
              const parts = [];
              if (feed.status === 'down') parts.push(t('feed.allDown', lang));
              else {
                if (s.clinical && !s.clinical.ok) parts.push(t('feed.appointmentsDown', lang));
                if (s.management && !s.management.ok) parts.push(t('feed.staffDown', lang));
                if (s.followUps && !s.followUps.ok) parts.push(t('feed.followUpsDown', lang));
                if (s.inventory && !s.inventory.ok) parts.push(t('feed.stockDown', lang));
              }
              const when = feed.at ? ' · ' + t('feed.lastUpdated', lang) + ' ' +
                new Date(feed.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
              return '⚠ ' + parts.join(' · ') + when;
            })()}
          </div>
        ) : null}
        <main className="content">{renderArea()}</main>
      </div>
    </div>
  );
}

// The clinic's real data, refreshed every minute while KuBi is open. It
// sits above the login gate for the same reason the day does: the staff
// list is needed to sign in, and a shift change must not drop it.
function useClinicFeed() {
  const [state, setState] = React.useState(window.KuBi.clinicFeed.state());
  React.useEffect(function () {
    const off = window.KuBi.clinicFeed.subscribe(function () { setState(window.KuBi.clinicFeed.state()); });
    window.KuBi.clinicFeed.start(60000);
    return function () { off(); window.KuBi.clinicFeed.stop(); };
  }, []);
  return state;
}

function App() {
  const [user, setUser] = React.useState(null);
  const [lang, setLang] = React.useState('en');
  const feed = useClinicFeed();
  const day = useClinicDay();
  day.setSavedBy(user ? user.name : null);
  if (!user) return <LoginScreen onLogin={setUser} lang={lang} setLang={setLang} feed={feed} />;
  return <Shell user={user} onLogout={function () { setUser(null); }} lang={lang} setLang={setLang} day={day} feed={feed} />;
}
window.KuBi.LoginScreen = LoginScreen;
window.KuBi.App = App;

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
