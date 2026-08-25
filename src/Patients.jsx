// Patients.jsx — the PATIENTS area. Front-desk status tracking only
// (Arrival -> Waiting -> Chair -> Completion). The clinical checklist
// for whatever treatment a patient is having lives in TREATMENT —
// tapping a patient's procedure name jumps there.

window.KuBi = window.KuBi || {};

function pick(field, lang) {
  if (!field) return '';
  return field[lang] || field.en;
}

window.KuBi.Patients = function Patients({ currentUser, lang, appointments, setStatus, goTo, initialApptId, initialSubtab }) {
  const t = window.KuBi.t;
  const RoleBadge = window.KuBi.RoleBadge;
  const readiness = window.KuBi.PRE_ARRIVAL_READINESS;
  const STATUSES = window.KuBi.CHECKIN_STATUSES;
  const [subtab, setSubtab] = React.useState(initialSubtab || 'journey');

  React.useEffect(function () {
    if (initialSubtab) setSubtab(initialSubtab);
  }, [initialSubtab]);

  const [readyChecked, setReadyChecked] = React.useState({});
  const [prepChecked, setPrepChecked] = React.useState({});
  const [expandedPrep, setExpandedPrep] = React.useState(initialApptId || null);
  const prep = window.KuBi.PRE_PROCEDURE_PREP;

  React.useEffect(function () {
    if (initialApptId) setExpandedPrep(initialApptId);
  }, [initialApptId]);

  function toggleReady(i) {
    setReadyChecked(function (prev) {
      const next = Object.assign({}, prev);
      next[i] = !next[i];
      return next;
    });
  }

  function togglePrepStep(apptId, stepIdx) {
    setPrepChecked(function (prev) {
      const next = Object.assign({}, prev);
      const apptState = Object.assign({}, next[apptId]);
      apptState[stepIdx] = !apptState[stepIdx];
      next[apptId] = apptState;
      return next;
    });
  }

  const readyDone = readiness.tasks.filter(function (_, i) { return readyChecked[i]; }).length;

  return (
    <div className="module">
      <div className="module-head">
        <h2>{t('journey.title', lang)}</h2>
        <p className="module-sub">{t('journey.subtitle', lang)}</p>
      </div>

      <div className="view-toggle sub-tab-row">
        <button className={'toggle-btn' + (subtab === 'journey' ? ' toggle-btn-active' : '')} onClick={function () { setSubtab('journey'); }}>{t('patients.tab.journey', lang)}</button>
        <button className={'toggle-btn' + (subtab === 'followup' ? ' toggle-btn-active' : '')} onClick={function () { setSubtab('followup'); }}>{t('patients.tab.followup', lang)}</button>
      </div>

      {subtab === 'followup' ? (
        <div className="card">
          <div className="card-title">{t('followup.title', lang)}</div>
          <p className="module-sub">{t('followup.subtitle', lang)}</p>
          <ul className="fu-list">
            {(window.KuBi.FOLLOW_UPS || []).slice().sort(function (a, b) { return a.due.localeCompare(b.due); }).map(function (f) {
              return (
                <li key={f.id} className={'fu-row' + (window.KuBi.isOverdue(f) ? ' fu-overdue' : '')}>
                  <span className="fu-dot">{window.KuBi.isOverdue(f) ? '🔴' : '🟢'}</span>
                  <span className="fu-patient">{f.patient}</span>
                  <span className="fu-reason">{f.reason}</span>
                  <span className="fu-due">{window.KuBi.isOverdue(f) ? t('followup.overdue', lang) + ' · ' : ''}{f.due}</span>
                  {f.phone ? <span className="fu-called">{t('followup.contacted', lang)}</span> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
      <React.Fragment>

      <div className="card">
        <div className="card-title">{t('checkin.todayList', lang)}</div>
        {appointments.slice().sort(function (a, b) { return a.time.localeCompare(b.time); }).map(function (a) {
          const stages = window.KuBi.JOURNEY_STAGES;
          const currentIdx = stages.indexOf(a.status);
          const isException = currentIdx === -1; // late / no_show
          return (
            <div className="journey-block" key={a.id}>
              <div className="journey-head">
                <span className="mono today-home-time-col">{a.time}</span>
                <span className="today-home-name">{a.patient}</span>
                {a.isNew ? <span className="new-patient-tag">{t('checkin.newPatient', lang)}</span> : null}
                <button className="link-btn journey-proc" onClick={function () { goTo('treatment', 'before', a.id); }}>{a.treatment}</button>
                {(function () {
                  const st = window.KuBi.stageLabel(a);
                  return st ? <span className="visit-badge">{st.current}</span> : null;
                })()}
                <span className="prep-chair-tag">{t('treatmentPrep.chair', lang)} {a.chair}</span>
                <select
                  className={'status-select status-select-' + a.status}
                  value={a.status}
                  onChange={function (e) { setStatus(a.id, e.target.value); }}
                >
                  {STATUSES.map(function (st) { return <option key={st} value={st}>{t('checkinStatus.' + st, lang)}</option>; })}
                </select>
              </div>
              {isException ? (
                <div className={'journey-exception status-select-' + a.status}>{t('checkinStatus.' + a.status, lang)}</div>
              ) : (
                <React.Fragment>
                  <div className="strip-label">{t('journey.todayLabel', lang)}</div>
                  <div className="journey-strip">
                    {stages.map(function (st, i) {
                      const state = i < currentIdx ? 'journey-past' : i === currentIdx ? 'journey-now' : 'journey-future';
                      return (
                        <React.Fragment key={st}>
                          <div className={'journey-stage ' + state}>
                            <div className="journey-dot" />
                            <div className="journey-label">{t('journey.stage.' + st, lang)}</div>
                          </div>
                          {i < stages.length - 1 ? <div className={'journey-line ' + (i < currentIdx ? 'journey-line-done' : '')} /> : null}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </React.Fragment>
              )}

              {a.caseStages && a.caseStages.length > 1 ? (
                <React.Fragment>
                  <div className="strip-label strip-label-case">{t('journey.caseLabel', lang)} — {a.procedureType}</div>
                  <div className="journey-strip case-strip">
                    {a.caseStages.map(function (cs, i) {
                      const state = cs.done ? 'journey-past' : cs.current ? 'journey-now' : 'journey-future';
                      return (
                        <React.Fragment key={i}>
                          <div className={'journey-stage case-stage ' + state}>
                            <div className="journey-dot" />
                            <div className="journey-label">{t('journey.visitShort', lang)} {i + 1}</div>
                            <div className="case-stage-name">{cs.name}</div>
                          </div>
                          {i < a.caseStages.length - 1 ? <div className={'journey-line ' + (cs.done ? 'journey-line-done' : '')} /> : null}
                        </React.Fragment>
                      );
                    })}
                  </div>
                </React.Fragment>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="card">
        <div className="section-header">
          <div className="card-title">{pick(readiness.title, lang)}</div>
          <div className="owner-badges">
            <span className="owner-badge-pair">
              <span className="owner-label">{t('readiness.owner', lang)}</span>
              <RoleBadge roleId={readiness.ownerRole} lang={lang} />
            </span>
            <span className="owner-badge-pair contingency">
              <span className="owner-label">{t('readiness.backup', lang)}</span>
              <RoleBadge roleId={readiness.contingencyRole} lang={lang} />
            </span>
          </div>
        </div>
        <div className="section-progress">{readyDone} / {readiness.tasks.length} {t('readiness.tasksDone', lang)}</div>
        <ul className="checklist">
          {readiness.tasks.map(function (task, i) {
            const c = readyChecked[i];
            return (
              <li key={i} className={c ? 'check-item check-item-done' : 'check-item'}>
                <label>
                  <input type="checkbox" checked={!!c} onChange={function () { toggleReady(i); }} />
                  <span className="task-block"><span className="task-label">{pick(task.label, lang)}</span></span>
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card">
        <div className="card-title">{t('checkin.todayList', lang)}</div>
        <table className="kb-table checkin-table">
          <thead>
            <tr>
              <th>{t('checkin.time', lang)}</th>
              <th>{t('checkin.patient', lang)}</th>
              <th>{t('checkin.doctor', lang)}</th>
              <th>{t('checkin.treatment', lang)}</th>
              <th>{t('checkin.status', lang)}</th>
              <th>{t('checkin.prep', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {appointments.slice().sort(function (a, b) { return a.time.localeCompare(b.time); }).map(function (a) {
              const apptPrep = prepChecked[a.id] || {};
              const prepDone = prep.steps.filter(function (_, i) { return apptPrep[i]; }).length;
              const isExpanded = expandedPrep === a.id;
              return (
                <React.Fragment key={a.id}>
                  <tr>
                    <td className="mono">{a.time}</td>
                    <td>
                      {a.patient}
                      {a.isNew ? <span className="new-patient-tag">{t('checkin.newPatient', lang)}</span> : null}
                    </td>
                    <td>{a.doctor}</td>
                    <td>
                      <button className="link-btn" onClick={function () { goTo('treatment', 'before', a.id); }}>{a.treatment}</button>
                    </td>
                    <td>
                      <select
                        className={'status-select status-select-' + a.status}
                        value={a.status}
                        onChange={function (e) { setStatus(a.id, e.target.value); }}
                      >
                        {STATUSES.map(function (st) { return <option key={st} value={st}>{t('checkinStatus.' + st, lang)}</option>; })}
                      </select>
                    </td>
                    <td>
                      <button className="prep-toggle-btn" onClick={function () { setExpandedPrep(isExpanded ? null : a.id); }}>
                        {prepDone}/{prep.steps.length} {isExpanded ? '▲' : '▼'}
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="prep-row">
                      <td colSpan="6">
                        <ul className="checklist prep-checklist">
                          {prep.steps.map(function (step, i) {
                            const c = apptPrep[i];
                            return (
                              <li key={i} className={c ? 'check-item check-item-done' : 'check-item'}>
                                <label>
                                  <input type="checkbox" checked={!!c} onChange={function () { togglePrepStep(a.id, i); }} />
                                  <span className="task-block"><span className="task-label">{pick(step, lang)}</span></span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      </React.Fragment>
      )}
    </div>
  );
};
