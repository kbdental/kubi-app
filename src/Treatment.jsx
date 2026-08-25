// Treatment.jsx — the TREATMENT area. Two sub-tabs: Before, After.
// Deliberately not split further (no separate Procedure/Documentation/
// Closure screens) — those are stages inside Before/After, not distinct
// UI. Supports deep-linking: opening with an initialApptId expands that
// appointment and picks whichever phase is currently relevant for it.

window.KuBi = window.KuBi || {};

function autoPhase(readyStats) {
  return readyStats.ready ? 'after' : 'before';
}

window.KuBi.Treatment = function Treatment({ lang, appointments, checked, onToggle, checkedAfter, onToggleAfter, initialApptId, initialSubtab, procedureState, onStartProcedure, onCompleteProcedure, closedCases, onCloseCase }) {
  const t = window.KuBi.t;
  const [expanded, setExpanded] = React.useState(initialApptId || null);
  const [subtab, setSubtab] = React.useState(initialSubtab || 'before');

  React.useEffect(function () {
    if (initialApptId) {
      setExpanded(initialApptId);
      const appt = appointments.find(function (a) { return a.id === initialApptId; });
      if (appt) {
        const stats = window.KuBi.treatmentReadyStats(appt.procedureType, checked[appt.id] || {});
        setSubtab(initialSubtab || autoPhase(stats));
      }
    }
    // eslint-disable-next-line
  }, [initialApptId]);

  const sorted = appointments.slice().sort(function (a, b) { return a.time.localeCompare(b.time); });
  const showingAfter = subtab === 'after';

  return (
    <div className="module">
      <div className="module-head">
        <h2>{t('nav.treatment', lang)}</h2>
        <p className="module-sub">{t('treatmentPrep.subtitle', lang)}</p>
      </div>

      <div className="view-toggle sub-tab-row">
        <button className={'toggle-btn' + (!showingAfter ? ' toggle-btn-active' : '')} onClick={function () { setSubtab('before'); }}>{t('treatmentPrep.before', lang)}</button>
        <button className={'toggle-btn' + (showingAfter ? ' toggle-btn-active' : '')} onClick={function () { setSubtab('after'); }}>{t('treatmentPrep.after', lang)}</button>
      </div>

      {sorted.map(function (a) {
        const apptChecked = checked[a.id] || {};
        const beforeStats = window.KuBi.treatmentReadyStats(a.procedureType, apptChecked);
        const beforeSteps = window.KuBi.TREATMENT_CHECKLISTS[a.procedureType] || [];

        const apptCheckedAfter = checkedAfter[a.id] || {};
        const afterStats = window.KuBi.treatmentAfterStats(a.procedureType, apptCheckedAfter);
        const afterSteps = window.KuBi.TREATMENT_CHECKLISTS_AFTER[a.procedureType] || [];

        const isExpanded = expanded === a.id;
        const proc = (procedureState && procedureState[a.id]) || {};
        const procRunning = !!proc.startedAt && !proc.completedAt;
        const procDone = !!proc.completedAt;
        const closed = (closedCases && closedCases[a.id]) || null;
        const gate = window.KuBi.closureGate(a.procedureType, apptCheckedAfter);
        const activeStats = showingAfter ? afterStats : beforeStats;
        const activeSteps = showingAfter ? afterSteps : beforeSteps;
        const activeChecked = showingAfter ? apptCheckedAfter : apptChecked;
        const activeToggle = showingAfter ? onToggleAfter : onToggle;
        const activeReady = showingAfter ? activeStats.complete : activeStats.ready;

        const badgeReady = showingAfter ? afterStats.complete : beforeStats.ready;
        const badgeDone = showingAfter ? afterStats.done : beforeStats.done;
        const badgeTotal = showingAfter ? afterStats.total : beforeStats.total;
        const badgeLabel = badgeReady ? (showingAfter ? t('treatmentPrep.complete', lang) : t('treatmentPrep.ready', lang)) : badgeDone + '/' + badgeTotal;

        return (
          <div className="card" key={a.id}>
            <button className="prep-appt-row" onClick={function () { setExpanded(isExpanded ? null : a.id); }}>
              <div className="prep-appt-left">
                <span className="mono prep-appt-time">{a.time}</span>
                <span className="prep-chair-tag">{t('treatmentPrep.chair', lang)} {a.chair}</span>
                <span className="prep-appt-patient">{a.patient}</span>
                <span className="prep-appt-proc">{a.procedureType}</span>
                {(function () {
                  const st = window.KuBi.stageLabel(a);
                  if (!st) return null;
                  return (
                    <span className="stage-pair">
                      <span className="visit-badge">{st.current}</span>
                      {st.next ? <span className="stage-next">{t('stage.next', lang)} {st.next}</span> : <span className="stage-next stage-final">{t('stage.finalStage', lang)}</span>}
                    </span>
                  );
                })()}
              </div>
              <span className={'verdict-pill ' + (closed ? 'verdict-closed' : procRunning ? 'verdict-running' : badgeReady ? 'verdict-ready' : 'verdict-not-ready')}>
                {closed ? '🟢 ' + t('closure.closed', lang) : procRunning ? '🔵 ' + t('proc.inProgress', lang) : (badgeReady ? '🟢 ' : '🔴 ') + badgeLabel}
              </span>
            </button>

            {isExpanded ? (
              <div className="prep-expand">
                <div className="kubi-bubble-row">
                  <div className="kubi-avatar">Ku</div>
                  <div className="kubi-bubble">{showingAfter ? t('treatmentPrep.afterIntro', lang) : t('treatmentPrep.beforeIntro', lang)}</div>
                </div>

                <div className={'kubi-bubble-row kubi-verdict-row ' + (activeReady ? 'kubi-verdict-good' : 'kubi-verdict-bad')}>
                  <div className="kubi-avatar">Ku</div>
                  <div className="kubi-bubble kubi-verdict-bubble">
                    <div className="kubi-verdict-line">
                      {activeReady
                        ? '🟢 ' + (showingAfter ? t('treatmentPrep.complete', lang) : t('treatmentPrep.ready', lang))
                        : '🔴 ' + (showingAfter ? t('treatmentPrep.notComplete', lang) : t('treatmentPrep.notReady', lang))}
                    </div>
                    {!activeReady ? (
                      <div className="kubi-verdict-sub">
                        {showingAfter ? t('treatmentPrep.afterIncomplete', lang) : t('treatmentPrep.missing', lang)} {activeStats.missing.join(', ')}
                      </div>
                    ) : null}
                  </div>
                </div>

                <ul className="checklist kubi-checklist">
                  {activeSteps.map(function (step, i) {
                    const c = activeChecked[i];
                    return (
                      <li key={i} className={c ? 'check-item check-item-done' : 'check-item'}>
                        <label>
                          <input type="checkbox" checked={!!c} onChange={function () { activeToggle(a.id, i); }} />
                          <span className="task-block"><span className="task-label">{step}</span></span>
                        </label>
                        <span className="checked-by">{c ? '✓' : '❌'}</span>
                      </li>
                    );
                  })}
                </ul>

                {!showingAfter ? (
                  <React.Fragment>
                    {(function () {
                      const sup = window.KuBi.procedureSupplyStatus(a.procedureType, a.id);
                      if (sup.ok && !sup.low.length) return null;
                      return (
                        <div className={'supply-line ' + (sup.ok ? 'supply-warn' : 'supply-block')}>
                          {sup.ok ? '⚠️ ' : '🔴 '}
                          {sup.blocking.map(function (m) { return pick(m.name, lang); }).concat(
                            sup.labMissing ? [t('inv.labPending', lang)] : []
                          ).concat(
                            sup.low.map(function (m) { return pick(m.name, lang) + ' (' + t('inv.low', lang) + ')'; })
                          ).join(', ')}
                        </div>
                      );
                    })()}
                    <div className="proc-panel">
                    {procRunning ? (
                      <div className="proc-running">
                        <div className="proc-running-head">
                          <span className="proc-pulse" />
                          {t('proc.inProgress', lang)}
                        </div>
                        <div className="proc-meta">
                          <span>{t('proc.started', lang)}: <strong>{new Date(proc.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                          <span>{t('proc.doctor', lang)}: <strong>{a.doctor}</strong></span>
                          <span>{t('proc.chair', lang)}: <strong>{a.chair}</strong></span>
                        </div>
                        <button className="btn-primary today-btn" onClick={function () { onCompleteProcedure(a.id); setSubtab('after'); }}>
                          {t('proc.completeBtn', lang)}
                        </button>
                      </div>
                    ) : procDone ? (
                      <div className="proc-meta proc-done-line">
                        ✓ {new Date(proc.startedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {' – '}
                        {new Date(proc.completedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}{a.doctor}
                      </div>
                    ) : (
                      <div className="proc-start">
                        <p className="module-sub">{beforeStats.ready ? t('proc.readyToStart', lang) : t('treatmentPrep.notReady', lang)}</p>
                        <button
                          className={beforeStats.ready ? 'btn-primary today-btn' : 'btn-primary today-btn btn-disabled'}
                          disabled={!beforeStats.ready}
                          onClick={function () { if (beforeStats.ready) onStartProcedure(a.id); }}
                        >
                          {t('proc.startBtn', lang)}
                        </button>
                      </div>
                    )}
                  </div>
                  </React.Fragment>
                ) : null}

                {showingAfter ? (
                  <div className="proc-panel">
                    {closed ? (
                      <div className="case-closed-banner">
                        🟢 {t('closure.closed', lang)}
                        <span className="case-closed-meta">{new Date(closed.closedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} · {closed.closedBy}</span>
                      </div>
                    ) : (
                      <React.Fragment>
                        {!gate.canClose ? (
                          <div className="closure-pending-block">
                            <div className="closure-count">🔴 {t('closure.notClosed', lang)}</div>
                            <div className="closure-remaining">
                              {afterStats.missing.length} {afterStats.missing.length === 1 ? t('closure.thingRemaining', lang) : t('closure.thingsRemaining', lang)}
                            </div>
                            <ul className="closure-missing-list">
                              {afterStats.missing.map(function (m, i) {
                                return <li key={i}>{m}</li>;
                              })}
                            </ul>
                          </div>
                        ) : (
                          <p className="module-sub">{t('closure.canClose', lang)}</p>
                        )}
                        <button
                          className={gate.canClose ? 'btn-primary today-btn' : 'btn-primary today-btn btn-disabled'}
                          disabled={!gate.canClose}
                          onClick={function () { if (gate.canClose) onCloseCase(a.id); }}
                        >
                          {t('closure.closeBtn', lang)}
                        </button>
                      </React.Fragment>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
