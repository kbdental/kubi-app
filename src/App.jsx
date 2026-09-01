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

function LoginScreen({ onLogin, lang, setLang }) {
  const t = window.KuBi.t;
  const [pin, setPin] = React.useState('');
  const [error, setError] = React.useState('');

  function submit(e) {
    e.preventDefault();
    const emp = window.KuBi.EMPLOYEES.find(function (x) { return x.pin === pin; });
    if (emp) { onLogin(emp); } else { setError(t('login.error', lang)); }
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
          <button className="btn-primary" type="submit">{t('login.signIn', lang)}</button>
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
  const [sterPacks, setSterPacks] = React.useState(window.KuBi.STER_PACKS || []);

  return {
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
    sterPacks: sterPacks, setSterPacks: setSterPacks,
  };
}

function Shell({ user, onLogout, lang, setLang, day }) {
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
  } = day;

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

  function openClinic() { setClinicStatus({ open: true, by: user.name, at: new Date() }); }
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
  }
  function toggleClosing(itemId) {
    setClosingChecked(function (prev) {
      const next = Object.assign({}, prev);
      next[itemId] = !next[itemId];
      return next;
    });
  }
  function toggleReadiness(key, byName) {
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
    setAppointments(function (prev) {
      return prev.map(function (a) { return a.id === id ? Object.assign({}, a, { status: status, statusAt: new Date() }) : a; });
    });
  }
  function startProcedure(apptId) {
    setProcedureState(function (prev) {
      const next = Object.assign({}, prev);
      next[apptId] = { startedAt: new Date(), startedBy: user.name, completedAt: null };
      return next;
    });
    setApptStatus(apptId, 'in_treatment');
  }
  function completeProcedure(apptId) {
    setProcedureState(function (prev) {
      const next = Object.assign({}, prev);
      const cur = Object.assign({}, next[apptId] || {});
      cur.completedAt = new Date();
      next[apptId] = cur;
      return next;
    });
  }

  function advancePack(packId) {
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
  function markLabReceived(apptId) {
    setLabReceived(function (prev) {
      const next = Object.assign({}, prev);
      next[apptId] = true;
      return next;
    });
  }

  function reportRepair(kind, place, what) {
    setRepairs(function (prev) {
      return prev.concat([{
        id: 'R' + (prev.length + 1) + '-' + prev.length,
        kind: kind, place: place, what: what,
        by: user.name, at: new Date(), done: false, doneAt: null,
      }]);
    });
  }
  function markRepairFixed(id) {
    setRepairs(function (prev) {
      return prev.map(function (r) {
        return r.id === id ? Object.assign({}, r, { done: true, doneAt: new Date() }) : r;
      });
    });
  }

  function setEquipment(id, ok, note) {
    setEquipmentStatus(function (prev) {
      const next = Object.assign({}, prev);
      next[id] = { ok: ok, note: note || '', at: new Date(), by: user.name };
      return next;
    });
  }

  function closeCase(apptId) {
    setClosedCases(function (prev) {
      const next = Object.assign({}, prev);
      next[apptId] = { closedAt: new Date(), closedBy: user.name };
      return next;
    });
    setApptStatus(apptId, 'done');
  }

  function toggleTreatmentStep(apptId, stepIdx) {
    setTreatmentChecked(function (prev) {
      const next = Object.assign({}, prev);
      const apptState = Object.assign({}, next[apptId]);
      apptState[stepIdx] = !apptState[stepIdx];
      next[apptId] = apptState;
      return next;
    });
  }
  function toggleTreatmentStepAfter(apptId, stepIdx) {
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
            <LangToggle lang={lang} setLang={setLang} />
            <button className="btn-ghost" onClick={onLogout}>{t('topbar.signOut', lang)}</button>
          </div>
        </header>
        <main className="content">{renderArea()}</main>
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = React.useState(null);
  const [lang, setLang] = React.useState('en');
  const day = useClinicDay();
  if (!user) return <LoginScreen onLogin={setUser} lang={lang} setLang={setLang} />;
  return <Shell user={user} onLogout={function () { setUser(null); }} lang={lang} setLang={setLang} day={day} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
