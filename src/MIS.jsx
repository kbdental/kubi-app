// MIS.jsx — management information. Six sections: Today, Patients,
// Treatment, Clinic, People, Exceptions.
//
// Every figure is TODAY-ONLY. Trend rows (7-day / 30-day) render as an
// explicit "no history yet" placeholder rather than a fabricated number —
// the layout is visible, the honesty is preserved.

window.KuBi = window.KuBi || {};

window.KuBi.MIS = function MIS(props) {
  const t = window.KuBi.t;
  const lang = props.lang;
  const RoleBadge = window.KuBi.RoleBadge;
  const SECTIONS = ['today', 'patients', 'treatment', 'clinic', 'people', 'exceptions'];
  const [sec, setSec] = React.useState('today');
  const [showTasks, setShowTasks] = React.useState(false);
  const [period, setPeriod] = React.useState('today');

  // Live figures for today; stored aggregates for any other period.
  const periodData = period === 'today' ? null : window.KuBi.aggregatePeriod(period);

  const ctx = {
    appointments: props.appointments,
    procedureState: props.procedureState,
    closedCases: props.closedCases,
    treatmentChecked: props.treatmentChecked,
    treatmentCheckedAfter: props.treatmentCheckedAfter,
    readinessChecked: props.readinessChecked,
    equipmentStatus: props.equipmentStatus,
    sterPacks: props.sterPacks,
    clinicStatus: props.clinicStatus,
    closingChecked: props.closingChecked,
  };

  const d = window.KuBi.misToday(ctx);
  const attention = props.attention || [];
  const readiness = window.KuBi.readinessStats(props.readinessChecked || {});

  const attendanceCounts = window.KuBi.attendanceCounts();
  const staffTotal = attendanceCounts.Present + attendanceCounts.Late + attendanceCounts.Absent;

  function Kpi({ label, value, tone }) {
    return (
      <div className={'mis-kpi' + (tone ? ' mis-' + tone : '')}>
        <div className="mis-kpi-value">{value}</div>
        <div className="mis-kpi-label">{label}</div>
      </div>
    );
  }

  function TrendTable() {
    // The five KPIs worth watching over time. `rate` fields average;
    // count fields sum — see MIS_COUNT_FIELDS / MIS_RATE_FIELDS.
    const rows = [
      { key: 'completed', label: t('mis.kpiPatients', lang), today: d.completed },
      { key: 'avgWait', label: t('mis.kpiWait', lang), today: d.avgWait, unit: t('attention.minutes', lang) },
      { key: 'casesClosed', label: t('mis.kpiClosure', lang), today: d.casesClosed },
      { key: 'readinessPct', label: t('own.readiness', lang), today: readiness.pct, unit: '%' },
      { key: 'exceptions', label: t('own.exceptions', lang), today: attention.length },
    ];

    return (
      <div className="card">
        <div className="card-title">{t('mis.trendTitle', lang)}</div>
        <table className="kb-table trend-table">
          <thead>
            <tr>
              <th>{t('mis.kpi', lang)}</th>
              <th>{t('mis.today', lang)}</th>
              <th>{t('mis.days7', lang)}</th>
              <th>{t('mis.days30', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (r) {
              const t7 = window.KuBi.trend(r.key, 7);
              const t30 = window.KuBi.trend(r.key, 30);
              const u = r.unit ? ' ' + r.unit : '';
              const todayVal = (r.today === null || r.today === undefined) ? '—' : r.today + u;

              // Direction is only meaningful against the 7-day figure.
              let arrow = null;
              if (t7 && typeof r.today === 'number') {
                const better = r.key === 'avgWait' || r.key === 'exceptions' ? r.today < t7.avg : r.today > t7.avg;
                const worse = r.key === 'avgWait' || r.key === 'exceptions' ? r.today > t7.avg : r.today < t7.avg;
                if (better) arrow = <span className="trend-arrow trend-better">↑</span>;
                else if (worse) arrow = <span className="trend-arrow trend-worse">↓</span>;
              }

              return (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="mono trend-today">{todayVal} {arrow}</td>
                  <td className={'mono' + (t7 ? '' : ' trend-empty')}>{t7 ? t7.avg + u : '—'}</td>
                  <td className={'mono' + (t30 ? '' : ' trend-empty')}>{t30 ? t30.avg + u : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {window.KuBi.historyDepth() === 0 ? (
          <p className="module-sub trend-note">{t('mis.trendNeedsHistory', lang)}</p>
        ) : null}
      </div>
    );
  }

  function Flow({ steps }) {
    return (
      <div className="mis-flow">
        {steps.map(function (s, i) {
          return (
            <React.Fragment key={i}>
              <div className="mis-flow-step">
                <div className="mis-flow-value">{s.value}</div>
                <div className="mis-flow-label">{s.label}</div>
              </div>
              {i < steps.length - 1 ? <span className="mis-flow-arrow">→</span> : null}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  return (
    <div className="mis-wrap">
      <div className="view-toggle sub-tab-row mis-tabs">
        {SECTIONS.map(function (s) {
          return (
            <button key={s} className={'toggle-btn' + (sec === s ? ' toggle-btn-active' : '')} onClick={function () { setSec(s); }}>
              {t('mis.sec.' + s, lang)}
            </button>
          );
        })}
      </div>

      <div className="mis-period-row">
        {window.KuBi.PERIODS.map(function (p) {
          const avail = window.KuBi.periodAvailable(p);
          return (
            <button
              key={p}
              className={'period-btn' + (period === p ? ' period-btn-active' : '') + (avail ? '' : ' period-btn-off')}
              disabled={!avail}
              title={avail ? '' : t('mis.noDataPeriod', lang)}
              onClick={function () { if (avail) setPeriod(p); }}
            >
              {t('mis.period.' + p, lang)}
            </button>
          );
        })}
      </div>

      {sec === 'today' ? (
        <React.Fragment>
          <div className="mis-date">
            {period === 'today'
              ? new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
              : t('mis.period.' + period, lang) + ' · ' + periodData.dayCount + ' ' + (periodData.dayCount === 1 ? t('mis.day', lang) : t('mis.daysWord', lang))}
          </div>

          <div className="mis-tile-grid">
            <div className="mis-tile">
              <div className="mis-tile-label">{t('mis.appointments', lang)}</div>
              <div className="mis-tile-value">
                {period === 'today' ? d.completed + ' / ' + d.booked : periodData.completed + ' / ' + periodData.booked}
              </div>
              <div className="mis-tile-sub">{t('own.completed', lang)}</div>
            </div>
            <div className="mis-tile">
              <div className="mis-tile-label">{t('nav.treatment', lang)}</div>
              <div className="mis-tile-value">
                {period === 'today' ? d.casesClosed + ' / ' + (d.booked - d.noShow) : periodData.casesClosed + ' / ' + (periodData.booked - periodData.noShow)}
              </div>
              <div className="mis-tile-sub">{t('own.completed', lang)}</div>
            </div>
            <div className={'mis-tile' + ((period === 'today' ? readiness.pct : periodData.readinessPct) >= 100 ? ' mis-tile-good' : '')}>
              <div className="mis-tile-label">{t('nav.clinic', lang)}</div>
              <div className="mis-tile-value">{(period === 'today' ? readiness.pct : periodData.readinessPct) + '%'}</div>
              <div className="mis-tile-sub">{t('own.readiness', lang)}</div>
            </div>
            <div className={'mis-tile' + ((period === 'today' ? d.maxWait : periodData.maxWait) > 15 ? ' mis-tile-warn' : '')}>
              <div className="mis-tile-label">{t('mis.waiting', lang)}</div>
              <div className="mis-tile-value">
                {(function () {
                  const v = period === 'today' ? d.avgWait : periodData.avgWait;
                  return v === null || v === undefined ? '—' : v + ' ' + t('attention.minutes', lang);
                })()}
              </div>
              <div className="mis-tile-sub">{t('mis.avgWait', lang)}</div>
            </div>
            <div className={'mis-tile' + (attendanceCounts.Absent ? ' mis-tile-warn' : '')}>
              <div className="mis-tile-label">{t('own.staff', lang)}</div>
              <div className="mis-tile-value">
                {period === 'today'
                  ? (attendanceCounts.Present + attendanceCounts.Late) + ' / ' + staffTotal
                  : periodData.staffPresent + ' / ' + periodData.staffTotal}
              </div>
              <div className="mis-tile-sub">{t('own.present', lang)}</div>
            </div>
            <div className={'mis-tile' + ((period === 'today' ? attention.length : periodData.exceptions) ? ' mis-tile-bad' : ' mis-tile-good')}>
              <div className="mis-tile-label">{t('own.exceptions', lang)}</div>
              <div className="mis-tile-value">{period === 'today' ? attention.length : periodData.exceptions}</div>
              <div className="mis-tile-sub">{period === 'today' ? t('mis.openNow', lang) : t('mis.inPeriod', lang)}</div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">{t('mis.attentionRequiredTitle', lang)}</div>
            {period !== 'today' ? (
              <p className="module-sub">{t('mis.attentionTodayOnly', lang)}</p>
            ) : attention.length === 0 ? (
              <p className="module-sub">{t('todayHome.allClear', lang)}</p>
            ) : (
              <ul className="mis-att-list">
                {attention.map(function (item) {
                  // Amber for time-pressure items, red for blockers.
                  const soft = item.kind === 'waitingTooLong';
                  return (
                    <li key={item.id} className="mis-att-row" onClick={function () { props.goTo(item.area, item.subtab || null, item.apptId || null, item.room || null); }}>
                      <span className="mis-att-mark">{soft ? '🟠' : '🔴'}</span>
                      <span className="mis-att-text">{props.describe(item)}</span>
                      {item.owner ? <RoleBadge roleId={item.owner} lang={lang} /> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <TrendTable />
        </React.Fragment>
      ) : null}

      {sec === 'patients' ? (
        <React.Fragment>
          <div className="card">
            <div className="card-title">{t('mis.patientFlow', lang)}</div>
            <Flow steps={[
              { label: t('journey.stage.booked', lang), value: d.booked },
              { label: t('journey.stage.arrived', lang), value: d.arrived },
              { label: t('journey.stage.in_chair', lang), value: d.inChair },
              { label: t('journey.stage.done', lang), value: d.completed },
            ]} />
            <div className="mis-kpi-grid mis-kpi-tight">
              <Kpi label={t('mis.noShow', lang)} value={d.noShow} tone={d.noShow ? 'warn' : null} />
              <Kpi label={t('mis.lateArrivals', lang)} value={d.late} />
              <Kpi label={t('mis.carriedForward', lang)} value={d.carriedForward} tone={d.carriedForward ? 'warn' : null} />
            </div>
          </div>
          <div className="card">
            <div className="card-title">{t('mis.waiting', lang)}</div>
            <div className="mis-kpi-grid mis-kpi-tight">
              <Kpi label={t('mis.avgWait', lang)} value={d.avgWait === null ? '—' : d.avgWait + ' ' + t('attention.minutes', lang)} />
              <Kpi label={t('mis.longestWait', lang)} value={d.maxWait === null ? '—' : d.maxWait + ' ' + t('attention.minutes', lang)} tone={d.maxWait > 15 ? 'warn' : null} />
            </div>
          </div>
        </React.Fragment>
      ) : null}

      {sec === 'treatment' ? (
        <React.Fragment>
          <div className="card">
            <div className="card-title">{t('mis.treatmentPerformance', lang)}</div>
            <div className="mis-kpi-grid mis-kpi-tight">
              <Kpi label={t('mis.planned', lang)} value={d.booked - d.noShow} />
              <Kpi label={t('mis.started', lang)} value={d.started} />
              <Kpi label={t('mis.finished', lang)} value={d.finished} />
              <Kpi label={t('own.casesClosed', lang)} value={d.casesClosed} />
              <Kpi label={t('mis.inProgress', lang)} value={d.running} />
              <Kpi label={t('treatmentPrep.notReady', lang)} value={d.notReady} tone={d.notReady ? 'bad' : null} />
              <Kpi label={t('mis.docPending', lang)} value={d.docPending} tone={d.docPending ? 'bad' : null} />
            </div>
          </div>
          <div className="card">
            <div className="card-title">{t('mis.byTreatment', lang)}</div>
            <table className="kb-table">
              <thead>
                <tr>
                  <th>{t('checkin.treatment', lang)}</th>
                  <th>{t('mis.planned', lang)}</th>
                  <th>{t('own.complete', lang)}</th>
                  <th>{t('mis.pending', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {window.KuBi.misByTreatment(ctx).map(function (r) {
                  return (
                    <tr key={r.type}>
                      <td>{r.type}</td>
                      <td className="mono">{r.planned}</td>
                      <td className="mono">{r.completed}</td>
                      <td className={'mono' + (r.pending ? ' mis-cell-warn' : '')}>{r.pending}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </React.Fragment>
      ) : null}

      {sec === 'clinic' ? (
        <React.Fragment>
        <div className="card">
          <div className="card-title">{t('mis.clinicReadiness', lang)}</div>
          <ul className="mis-area-list">
            {window.KuBi.misClinicAreas(ctx).map(function (a) {
              let detail = '';
              if (a.area === 'opening' && !a.ok) detail = t('closing.openFirst', lang);
              else if (a.area === 'closing' && a.pending) detail = '—';
              else if (!a.ok && a.count) detail = a.count + ' ' + t('mis.outstanding', lang);
              if (a.area === 'inventory' && a.ok && a.warn) detail = a.warn + ' ' + t('inv.low', lang);
              return (
                <li key={a.area} className="mis-area-row">
                  <span className="mis-area-dot">{a.area === 'closing' && a.pending ? '—' : (a.ok ? '🟢' : '🔴')}</span>
                  <span className="mis-area-name">{t('mis.area.' + a.area, lang)}</span>
                  <span className="mis-area-detail">{detail}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="card">
          <div className="card-title-row">
            <div className="card-title">{t('mis.allTasks', lang)}</div>
            <button className="toggle-btn" onClick={function () { setShowTasks(!showTasks); }}>
              {showTasks ? t('mis.hideTasks', lang) : t('mis.showTasks', lang)}
            </button>
          </div>
          {showTasks ? (
            <div className="mis-tasklist">
              {window.KuBi.CLINIC_READINESS.map(function (section) {
                const rooms = section.perRoom ? (window.KuBi.CLINIC_ROOMS || [null]) : [null];
                return rooms.map(function (room) {
                  let total = 0, done = 0;
                  const rows = [];
                  section.groups.forEach(function (g, gi) {
                    g.tasks.forEach(function (task, ti) {
                      const key = window.KuBi.taskKey(section, gi, ti, room);
                      total++;
                      const c = (props.readinessChecked || {})[key];
                      if (c) done++;
                      rows.push({ key: key, label: task.label, done: !!c, by: c && c.by });
                    });
                  });
                  return (
                    <div className="mis-task-section" key={section.id + '-' + room}>
                      <div className="mis-task-head">
                        <span className="mis-task-title">
                          {(section.title[lang] || section.title.en)}
                          {room ? ' — ' + t('clinic.room', lang) + ' ' + room : ''}
                        </span>
                        <span className={'mis-task-count' + (done === total ? ' mis-task-done' : '')}>{done}/{total}</span>
                      </div>
                      <ul className="mis-task-items">
                        {rows.map(function (r) {
                          return (
                            <li key={r.key} className={r.done ? 'mis-task-item mis-task-item-done' : 'mis-task-item'}>
                              <span className="mis-task-mark">{r.done ? '✓' : '○'}</span>
                              <span>{r.label[lang] || r.label.en}</span>
                              {r.by ? <span className="mis-task-by">{r.by}</span> : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                });
              })}
            </div>
          ) : null}
        </div>
        </React.Fragment>
      ) : null}

      {sec === 'people' ? (
        <React.Fragment>
          <div className="card">
            <div className="card-title">{t('mis.staffToday', lang)}</div>
            <div className="mis-kpi-grid mis-kpi-tight">
              <Kpi label={t('mis.scheduled', lang)} value={staffTotal} />
              <Kpi label={t('status.Present', lang)} value={attendanceCounts.Present} tone="good" />
              <Kpi label={t('status.Late', lang)} value={attendanceCounts.Late} tone={attendanceCounts.Late ? 'warn' : null} />
              <Kpi label={t('status.Absent', lang)} value={attendanceCounts.Absent} tone={attendanceCounts.Absent ? 'bad' : null} />
            </div>
          </div>
          <div className="card">
            <div className="card-title">{t('mis.roleExecution', lang)}</div>
            <table className="kb-table">
              <thead>
                <tr>
                  <th>{t('employee.role', lang)}</th>
                  <th>{t('mis.tasks', lang)}</th>
                  <th>{t('own.complete', lang)}</th>
                  <th>{t('mis.pending', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {window.KuBi.misByRole(ctx).map(function (r) {
                  return (
                    <tr key={r.role}>
                      <td><RoleBadge roleId={r.role} lang={lang} /></td>
                      <td className="mono">{r.total}</td>
                      <td className="mono">{r.done}</td>
                      <td className={'mono' + (r.pending ? ' mis-cell-warn' : '')}>{r.pending}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </React.Fragment>
      ) : null}

      {sec === 'exceptions' ? (
        <div className="card">
          <div className="card-title">{t('mis.sec.exceptions', lang)}</div>
          {attention.length === 0 ? (
            <p className="module-sub">{t('exceptions.none', lang)}</p>
          ) : (
            <table className="kb-table">
              <thead>
                <tr>
                  <th>{t('mis.exception', lang)}</th>
                  <th>{t('mis.areaCol', lang)}</th>
                  <th>{t('why.owner', lang).replace(':', '')}</th>
                </tr>
              </thead>
              <tbody>
                {attention.map(function (item) {
                  return (
                    <tr key={item.id} className="mis-exc-row" onClick={function () { props.goTo(item.area, item.subtab || null, item.apptId || null, item.room || null); }}>
                      <td>{props.describe(item)}</td>
                      <td>{t('nav.' + item.area, lang)}</td>
                      <td>{item.owner ? <RoleBadge roleId={item.owner} lang={lang} /> : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="module-sub mis-exc-note">{t('mis.excNote', lang)}</p>
        </div>
      ) : null}
    </div>
  );
};
