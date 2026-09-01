// Patients.jsx — the PATIENTS area. Front-desk status tracking only
// (Arrival -> Waiting -> Chair -> Completion). The clinical checklist
// for whatever treatment a patient is having lives in TREATMENT —
// tapping a patient's procedure name jumps there.

window.KuBi = window.KuBi || {};

function pick(field, lang) {
  if (!field) return '';
  return field[lang] || field.en;
}

window.KuBi.Patients = function Patients({ currentUser, lang, appointments, setStatus, goTo, initialApptId, initialSubtab, labReceived, onLabReceived,
                                        treatmentChecked, treatmentCheckedAfter, procedureState, closedCases }) {
  const t = window.KuBi.t;
  const RoleBadge = window.KuBi.RoleBadge;
  const readiness = window.KuBi.PRE_ARRIVAL_READINESS;
  const STATUSES = window.KuBi.CHECKIN_STATUSES;
  const [subtab, setSubtab] = React.useState(initialSubtab || 'journey');
  // A case is not a place you navigate to — it is what you get when you
  // click a patient, a lab item, a follow-up or a lapsed record. So it
  // opens over whichever list you were reading, and Back returns you there.
  const [openCaseId, setOpenCaseId] = React.useState(null);

  const caseCtx = {
    lang: lang,
    appointments: appointments,
    procedureState: procedureState || {},
    closedCases: closedCases || {},
    labReceived: labReceived,
  };

  // Before / Procedure / After / Closure, for the visit happening today.
  // With nobody booked in there is no visit to report on, and saying so is
  // more honest than showing four "pending" rows.
  function visitStatus(thread) {
    const appt = thread.today;
    if (!appt) return null;
    const before = window.KuBi.treatmentReadyStats(appt.procedureType, (treatmentChecked || {})[appt.id] || {});
    const proc = (procedureState || {})[appt.id] || {};
    const gate = window.KuBi.closureGate(appt.procedureType, (treatmentCheckedAfter || {})[appt.id] || {});
    return {
      before: before.ready ? t('case.complete', lang) : before.done + ' / ' + (before.done + before.missing.length),
      beforeOk: before.ready,
      procedure: proc.completedAt ? t('case.complete', lang)
               : proc.startedAt ? t('case.inProgress', lang)
               : t('case.pending', lang),
      procedureOk: !!proc.completedAt,
      after: gate.canClose ? t('case.complete', lang) : t('case.pending', lang),
      afterOk: gate.canClose,
    };
  }

  function CaseView({ caseId }) {
    const thread = window.KuBi.caseThread(caseId, caseCtx);
    if (!thread) return <div className="card"><p className="module-sub">{t('case.noCase', lang)}</p></div>;
    const vs = visitStatus(thread);
    const cl = thread.closure;
    const row = function (label, value, tone) {
      return (
        <div className="case-status-row">
          <span className="case-status-label">{label}</span>
          <span className={'case-status-value' + (tone ? ' case-status-' + tone : '')}>{value}</span>
        </div>
      );
    };
    return (
      <div className="card case-view">
        <button className="rowbtn case-back" onClick={function () { setOpenCaseId(null); }}>← {t('case.back', lang)}</button>

        <div className="case-patient">{thread.patient}</div>
        <div className="case-eyebrow">{t('case.active', lang)}</div>
        <div className="case-treatment">{thread.treatment}</div>
        {thread.diagnosis ? (
          <div className="case-diagnosis">{t('case.diagnosis', lang)}: {thread.diagnosis}</div>
        ) : null}

        <div className="case-nownext">
          <div><span className="case-status-label">{t('case.current', lang)}</span>
            <span className="case-stage-now">{thread.progress.current || '—'}</span></div>
          <div><span className="case-status-label">{t('case.next', lang)}</span>
            <span className="case-stage-next">{thread.progress.next || '—'}</span></div>
        </div>

        <div className="case-status-label case-visits-label">
          {t('case.visits', lang)} {thread.progress.visitsDone} / {thread.progress.visitsTotal}
        </div>
        <ul className="case-visit-list">
          {thread.progress.stages.map(function (st, i) {
            return (
              <li key={i} className={'case-visit ' + (st.done ? 'case-visit-done' : st.current ? 'case-visit-now' : 'case-visit-future')}>
                <span className="case-visit-mark">{st.done ? '✓' : st.current ? '●' : '○'}</span>
                <span className="case-visit-name">{st.name}</span>
              </li>
            );
          })}
        </ul>

        <div className="case-status-row">
          <span className="case-status-label">{t('case.today', lang)}</span>
          <span className="case-status-value">
            {thread.today
              ? t('checkinStatus.' + thread.today.status, lang) + ' — ' + t('treatmentPrep.chair', lang) + ' ' + thread.today.chair
              : t('case.notToday', lang)}
          </span>
        </div>

        <div className="case-status-block">
          <div className="card-title">{t('case.status', lang)}</div>
          {vs ? (
            <React.Fragment>
              {row(t('case.before', lang), vs.before, vs.beforeOk ? 'good' : 'warn')}
              {row(t('case.procedure', lang), vs.procedure, vs.procedureOk ? 'good' : null)}
              {row(t('case.after', lang), vs.after, vs.afterOk ? 'good' : 'warn')}
            </React.Fragment>
          ) : (
            <p className="module-sub">{t('case.notApplicable', lang)}</p>
          )}
          {row(t('case.closure', lang), cl.caseClosed ? t('case.closed', lang) : t('case.notYet', lang),
               cl.caseClosed ? 'good' : null)}
        </div>

        {/* What the PROCEDURE brings, not what somebody assembled: the
            template's materials and whether a lab is involved. */}
        {(function () {
          const tpl = window.KuBi.treatmentTemplate(thread.procedureType, lang);
          if (!tpl.known) return null;
          return (
            <div className="case-status-block">
              <div className="card-title">{t('case.needs', lang)}</div>
              {row(t('case.materials', lang),
                   tpl.materials.length
                     ? tpl.materials.map(function (m) { return m.name[lang] || m.name.en; }).join(', ')
                     : t('case.none', lang),
                   tpl.materials.some(function (m) { return window.KuBi.materialState(m) === 'out'; }) ? 'bad'
                     : tpl.materials.some(function (m) { return window.KuBi.materialState(m) === 'low'; }) ? 'warn' : 'good')}
              {(function () {
                // A treatment that needs a lab with nothing recorded is a
                // different problem from work that is simply not back yet,
                // and the case should say which.
                if (!tpl.needsLab) return row(t('case.labWork', lang), t('case.labNotNeeded', lang), null);
                if (!thread.lab.length) return row(t('case.labWork', lang), t('case.labUnrecorded', lang), 'bad');
                return row(t('case.labWork', lang), t('case.labNeeded', lang), null);
              })()}
            </div>
          );
        })()}

        <div className="case-status-block case-timeline-block">
          <div className="card-title">{t('timeline.title', lang)}</div>
          <ol className="case-timeline">
            {thread.timeline.map(function (e, i) {
              // Read-only, and short by design: what happened, when, by whom.
              let label = '';
              if (e.kind === 'caseOpened' || e.kind === 'diagnosisConfirmed' || e.kind === 'visitDocumented') {
                label = t('timeline.' + e.kind, lang);
              } else if (e.kind === 'labSent' || e.kind === 'labReceived') {
                label = (e.item ? (e.item[lang] || e.item.en) + ' ' : '') + t('timeline.' + e.kind, lang);
              } else if (e.kind === 'nextStage') {
                label = e.stage;
              } else {
                label = (e.stage ? e.stage + ' ' : '') + t('timeline.' + e.kind, lang);
              }
              return (
                <li key={i} className={'tl-entry' + (e.ahead ? ' tl-ahead' : '') + (e.on === window.KuBi.operatingDate() ? ' tl-today' : '')}>
                  <span className="tl-when">
                    {e.ahead ? t('timeline.nextStage', lang)
                             : e.on === window.KuBi.operatingDate() ? t('timeline.today', lang) : e.on}
                  </span>
                  <span className="tl-what">{label}</span>
                  {/* Just the name. "by X" cannot be translated into Hindi
                      without reordering the line, and the column already
                      reads as who did it. */}
                  {!e.ahead && (e.by || e.lab) ? <span className="tl-who">{e.by || e.lab}</span> : null}
                </li>
              );
            })}
          </ol>
        </div>

        <div className="case-status-block">
          {row(t('case.lab', lang),
               thread.lab.length
                 ? thread.lab.map(function (l) {
                     return (l.item[lang] || l.item.en) + ' — ' +
                            (l.received ? t('lab.received', lang)
                                        : (window.KuBi.labIsLate(l) ? t('lab.late', lang) : t('lab.awaited', lang)));
                   }).join(', ')
                 : t('case.none', lang),
               thread.lab.some(function (l) { return window.KuBi.labIsLate(l); }) ? 'bad' : null)}
          {row(t('case.followUp', lang),
               cl.followUp ? cl.followUp.reason + ' — ' + cl.followUp.due : t('case.none', lang),
               cl.followUpDue ? 'bad' : null)}
        </div>
      </div>
    );
  }


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

      {openCaseId ? <CaseView caseId={openCaseId} /> : null}

      <div className="view-toggle sub-tab-row" style={openCaseId ? { display: 'none' } : null}>
        <button className={'toggle-btn' + (subtab === 'journey' ? ' toggle-btn-active' : '')} onClick={function () { setSubtab('journey'); }}>{t('patients.tab.journey', lang)}</button>
        <button className={'toggle-btn' + (subtab === 'followup' ? ' toggle-btn-active' : '')} onClick={function () { setSubtab('followup'); }}>{t('patients.tab.followup', lang)}</button>
        <button className={'toggle-btn' + (subtab === 'lab' ? ' toggle-btn-active' : '')} onClick={function () { setSubtab('lab'); }}>{t('patients.tab.lab', lang)}</button>
        <button className={'toggle-btn' + (subtab === 'lapsed' ? ' toggle-btn-active' : '')} onClick={function () { setSubtab('lapsed'); }}>{t('patients.tab.lapsed', lang)}</button>
      </div>

      {/* The only screen in KuBi that is not about today. Everywhere else
          answers "what is happening now"; this one answers "who did we
          stop hearing from". */}
      {subtab === 'lapsed' ? (function () {
        const lapsed = window.KuBi.lapsedPatients();
        return (
          <div className="card">
            <div className="card-title">
              {t('lapsed.title', lang)}
              {lapsed.length ? <span className="repair-count">{lapsed.length} {t('lapsed.count', lang)}</span> : null}
            </div>
            <p className="module-sub">{t('lapsed.subtitle', lang)}</p>
            {lapsed.length === 0 ? (
              <p className="module-sub">{t('lapsed.none', lang)}</p>
            ) : (
              <ul className="fu-list">
                {lapsed.map(function (r) {
                  const days = window.KuBi.daysSinceVisit(r);
                  return (
                    <li key={r.id} className="fu-row">
                      <span className="fu-dot">{r.started ? '🟡' : '🔴'}</span>
                      <span className="fu-patient">{r.patient}</span>
                      <span className="fu-reason">
                        <span className="lapsed-kind">{r.started ? t('lapsed.unfinished', lang) : t('lapsed.neverStarted', lang)}</span>
                        <span className="lapsed-plan">{r.planned}</span>
                      </span>
                      <span className="fu-due">{t('lapsed.lastSeen', lang)} {days} {t('lapsed.daysAgo', lang)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })() : null}

      {/* Lab work belongs with patients, not with stock: the question is
          always "has this patient's crown come back?", never "how many
          crowns do we have?". */}
      {subtab === 'lab' ? (function () {
        const cases = window.KuBi.labCases(labReceived);
        const pending = window.KuBi.labPending(labReceived);
        return (
          <div className="card">
            <div className="card-title">
              {t('lab.title', lang)}
              {pending.length ? <span className="repair-count">{pending.length} {t('lab.pendingCount', lang)}</span> : null}
            </div>
            <p className="module-sub">{t('lab.subtitle', lang)}</p>
            {cases.length === 0 ? (
              <p className="module-sub">{t('lab.none', lang)}</p>
            ) : (
              <ul className="fu-list">
                {cases.map(function (c) {
                  const late = window.KuBi.labIsLate(c);
                  const today = window.KuBi.labIsDueToday(c);
                  return (
                    <li key={c.id} className={'fu-row' + (late ? ' fu-overdue' : '')}>
                      <span className="fu-dot">{c.received ? '🟢' : late ? '🔴' : '🟡'}</span>
                      {c.caseId && window.KuBi.caseById(c.caseId) ? (
                        <button className="link-btn fu-patient case-link"
                                onClick={function () { setOpenCaseId(c.caseId); }}>{c.patient}</button>
                      ) : <span className="fu-patient">{c.patient}</span>}
                      <span className="fu-reason">
                        {(c.item[lang] || c.item.en)}{c.lab ? ' · ' + c.lab : ''}
                      </span>
                      <span className="fu-due">
                        {c.received ? t('lab.received', lang)
                          : late ? t('lab.late', lang) + ' · ' + t('lab.due', lang) + ' ' + c.due
                          : today ? t('lab.dueToday', lang)
                          : t('lab.due', lang) + ' ' + c.due}
                      </span>
                      {!c.received ? (
                        <button className="rowbtn" onClick={function () { onLabReceived(c.id); }}>{t('lab.markReceived', lang)}</button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
      );
      })() : null}

      {subtab === 'followup' ? (
        <div className="card">
          <div className="card-title">{t('followup.title', lang)}</div>
          <p className="module-sub">{t('followup.subtitle', lang)}</p>
          <ul className="fu-list">
            {(window.KuBi.FOLLOW_UPS || []).slice().sort(function (a, b) { return a.due.localeCompare(b.due); }).map(function (f) {
              return (
                <li key={f.id} className={'fu-row' + (window.KuBi.isOverdue(f) ? ' fu-overdue' : '')}>
                  <span className="fu-dot">{window.KuBi.isOverdue(f) ? '🔴' : '🟢'}</span>
                  {f.caseId && window.KuBi.caseById(f.caseId) ? (
                    <button className="link-btn fu-patient case-link"
                            onClick={function () { setOpenCaseId(f.caseId); }}>{f.patient}</button>
                  ) : <span className="fu-patient">{f.patient}</span>}
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
                {a.caseId && window.KuBi.caseById(a.caseId) ? (
                  <button className="link-btn today-home-name case-link"
                          onClick={function () { setOpenCaseId(a.caseId); }}>{a.patient}</button>
                ) : (
                  <span className="today-home-name">{a.patient}</span>
                )}
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
                    {/* Read through the case rather than off the appointment, so
                        the strip and everything else that asks about this case
                        cannot end up describing different stages. Falls back to
                        the appointment's own list for a case the registry does
                        not know, which keeps a one-off visit rendering. */}
                    {(window.KuBi.caseById(a.caseId)
                      ? window.KuBi.caseProgress(a.caseId, appointments).stages
                      : a.caseStages).map(function (cs, i, all) {
                      const state = cs.done ? 'journey-past' : cs.current ? 'journey-now' : 'journey-future';
                      return (
                        <React.Fragment key={i}>
                          <div className={'journey-stage case-stage ' + state}>
                            <div className="journey-dot" />
                            <div className="journey-label">{t('journey.visitShort', lang)} {i + 1}</div>
                            <div className="case-stage-name">{cs.name}</div>
                          </div>
                          {i < all.length - 1 ? <div className={'journey-line ' + (cs.done ? 'journey-line-done' : '')} /> : null}
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
