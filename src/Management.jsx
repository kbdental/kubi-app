// Management.jsx — the MANAGEMENT area. Tabs: Owner, MIS, People.
// The default is the Owner View: one screen answering "what
// needs my attention?", not a wall of charts. Every number here is
// derived from live state elsewhere in the app, so it can never disagree
// with what staff are seeing.
//
// MIS is a tab here, not a top-level area: there are five areas — today,
// clinic, patients, treatment, management — and management reporting
// belongs inside management.

window.KuBi = window.KuBi || {};

function pick(field, lang) {
  if (!field) return '';
  return field[lang] || field.en;
}

window.KuBi.Management = function Management({ lang, appointments, treatmentChecked, treatmentCheckedAfter, checked, clinicStatus, procedureState, closedCases, equipmentStatus, sterPacks, closingChecked, initialSubtab, repairs, labReceived, audit, goTo }) {
  const t = window.KuBi.t;
  const TABS = ['owner', 'mis', 'people'];
  const [subtab, setSubtab] = React.useState(initialSubtab || 'owner');

  React.useEffect(function () {
    if (initialSubtab) setSubtab(initialSubtab);
  }, [initialSubtab]);

  // ---- derived counts --------------------------------------------------
  const readiness = window.KuBi.readinessStats(checked);
  const attention = window.KuBi.computeAttentionItems(
    appointments, treatmentCheckedAfter, checked, clinicStatus, procedureState, closedCases, treatmentChecked, repairs, labReceived, equipmentStatus
  );

  const scheduled = appointments.filter(function (a) { return a.status !== 'no_show'; }).length;
  const completed = appointments.filter(function (a) { return a.status === 'done'; }).length;

  const inProgress = appointments.filter(function (a) {
    const p = (procedureState || {})[a.id];
    return p && p.startedAt && !p.completedAt;
  }).length;

  // Delayed = waiting beyond the SOP threshold, or a no-show.
  const delayed = appointments.filter(function (a) {
    if (a.status === 'no_show') return true;
    if (a.status === 'waiting' && a.statusAt) {
      return Math.floor((Date.now() - new Date(a.statusAt).getTime()) / 60000) > 15;
    }
    return false;
  }).length;

  const treatmentsComplete = appointments.filter(function (a) { return (closedCases || {})[a.id]; }).length;

  // Documentation: of the procedures actually finished, how many have a
  // complete after-checklist. Cases never started aren't counted against it.
  const finished = appointments.filter(function (a) {
    const p = (procedureState || {})[a.id];
    return p && p.completedAt;
  });
  const documented = finished.filter(function (a) {
    return window.KuBi.treatmentAfterStats(a.procedureType, (treatmentCheckedAfter || {})[a.id] || {}).complete;
  }).length;

  const attendanceCounts = window.KuBi.attendanceCounts();
  const staffPresent = attendanceCounts.Present + attendanceCounts.Late;
  const staffTotal = staffPresent + attendanceCounts.Absent;


  // How long, briefly. Minutes stop being useful after an hour and hours
  // after a day, and an exception four days old should read as four days.
  function openFor(item) {
    const m = item.escalation ? item.escalation.ageMinutes : 0;
    if (m < 60) return m + ' ' + t('attention.minutesShort', lang);
    if (m < 1440) return Math.floor(m / 60) + ' ' + t('attention.hoursShort', lang);
    return Math.floor(m / 1440) + ' ' + t('attention.daysShort', lang);
  }

  function attentionText(item) {
    if (item.kind === 'waitingTooLong') return item.patient + ' — ' + t('attention.waitingTooLong', lang) + ' ' + item.minutes + ' ' + t('attention.minutes', lang);
    if (item.kind === 'noShow') return item.patient + ' — ' + t('attention.noShow', lang);
    if (item.kind === 'roomNotReady') return t('clinic.room', lang) + ' ' + item.room_no + ' — ' + t('attention.roomNotReady', lang);
    if (item.kind === 'treatmentNotReady') return item.patient + ' — ' + t('attention.treatmentNotReady', lang);
    if (item.kind === 'caseNotClosed') return item.patient + ' — ' + t('attention.caseNotClosed', lang);
    if (item.kind === 'repairOpen') return item.what + ' — ' + t('attention.repairOpen', lang) + ' (' + item.days + ' ' + t('repair.days', lang) + ')';
    if (item.kind === 'labLate') return item.patient + ' — ' + (item.item[lang] || item.item.en) + ' ' + t('attention.labLate', lang);
    if (item.kind === 'followUpDue') return item.patient + ' — ' + t('attention.followUpDue', lang) + ' (' + item.reason + ')';
    if (item.kind === 'equipmentDown') {
      const nm = item.equipItem
        ? (item.equipItem.isChair ? t('clinic.room', lang) + ' ' + item.equipItem.room
                                  : (item.equipItem.name[lang] || item.equipItem.name.en))
        : '';
      return nm + ' — ' + t('now.equipmentDown', lang) + (item.note ? ': ' + item.note : '');
    }
    return '';
  }

  function Metric({ label, value, tone, sub }) {
    return (
      <div className={'own-metric' + (tone ? ' own-' + tone : '')}>
        <div className="own-metric-label">{label}</div>
        <div className="own-metric-value">{value}</div>
        {sub ? <div className="own-metric-sub">{sub}</div> : null}
      </div>
    );
  }

  return (
    <div className="module">
      <div className="module-head">
        <h2>{t('nav.management', lang)}</h2>
      </div>

      <div className="view-toggle sub-tab-row">
        {TABS.map(function (tb) {
          return (
            <button key={tb} className={'toggle-btn' + (subtab === tb ? ' toggle-btn-active' : '')} onClick={function () { setSubtab(tb); }}>
              {t('management.tab.' + tb, lang)}
            </button>
          );
        })}
      </div>

      {subtab === 'owner' ? (
        <React.Fragment>
          <div className="own-grid">
            <Metric
              label={t('own.clinic', lang)}
              value={(clinicStatus.open ? '🟢 ' : '🔴 ') + t(clinicStatus.open ? 'today.openLabel' : 'today.closedLabel', lang)}
              tone={clinicStatus.open ? 'good' : 'bad'}
            />
            <Metric
              label={t('own.patients', lang)}
              value={completed + ' / ' + scheduled}
              sub={t('own.completed', lang)}
            />
            <Metric
              label={t('own.treatments', lang)}
              value={treatmentsComplete + ' ' + t('own.complete', lang)}
              sub={inProgress + ' ' + t('own.inProgress', lang) + (delayed ? ' · ' + delayed + ' ' + t('own.delayed', lang) : '')}
              tone={delayed ? 'warn' : null}
            />
            <Metric
              label={t('own.readiness', lang)}
              value={readiness.pct + '%'}
              tone={readiness.pct >= 100 ? 'good' : readiness.pct >= 50 ? null : 'bad'}
            />
            <Metric
              label={t('own.staff', lang)}
              value={staffPresent + ' / ' + staffTotal}
              sub={t('own.present', lang)}
              tone={attendanceCounts.Absent ? 'warn' : 'good'}
            />
            <Metric
              label={t('own.documentation', lang)}
              value={documented + ' / ' + finished.length}
              sub={t('own.complete', lang)}
              tone={finished.length && documented < finished.length ? 'warn' : 'good'}
            />
            <Metric
              label={t('own.casesClosed', lang)}
              value={treatmentsComplete + ' / ' + finished.length}
              sub={t('own.closed', lang)}
              tone={finished.length && treatmentsComplete < finished.length ? 'warn' : 'good'}
            />
            <Metric
              label={t('own.exceptions', lang)}
              value={String(attention.length)}
              tone={attention.length ? 'bad' : 'good'}
            />
          </div>

          <div className="card own-attention-card">
            <div className="card-title">
              {attention.length ? '🔴 ' : '🟢 '}{t('own.attention', lang)}
              {attention.length ? <span className="own-attention-count">{attention.length}</span> : null}
            </div>
            {attention.length === 0 ? (
              <p className="module-sub">{t('todayHome.allClear', lang)}</p>
            ) : (
              <ol className="own-attention-list">
                {attention.slice(0, 5).map(function (item) {
                  return (
                    <li key={item.id} className="own-attention-item" onClick={function () { goTo(item.area, item.subtab || null, item.apptId || null, item.room || null); }}>
                      <span className="attention-area-tag">{t('nav.' + item.area, lang).toUpperCase()}</span>
                      <span className="attention-body">
                        <span className="attention-text">{attentionText(item)}</span>
                        {item.owner ? (
                          <span className="attention-owner">
                            {t('why.owner', lang)} <window.KuBi.RoleBadge roleId={item.owner} lang={lang} />
                            {item.escalation && item.escalation.escalated ? (
                              <span className="attention-escalated">{t('attention.escalated', lang)}</span>
                            ) : null}
                            {item.escalation && item.escalation.ageMinutes > 0 ? (
                              <span className="attention-age">{openFor(item)} {t('attention.openFor', lang)}</span>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
                {attention.length > 5 ? (
                  <li className="own-attention-item attention-more">
                    <span className="attention-body">
                      <span className="attention-text">+{attention.length - 5} {t('attention.andMore', lang)}</span>
                    </span>
                  </li>
                ) : null}
              </ol>
            )}
          </div>
        </React.Fragment>
      ) : null}


      {/* MIS is management reporting, so it lives here rather than
          standing beside the clinical day as a sixth area. */}
      {/* Who changed what, and when. Inside the Owner view rather than a
          tab of its own: the structure is frozen, and an audit is something
          you consult, not somewhere you work. */}
      {subtab === 'owner' ? (function () {
        const log = audit || [];
        const recent = window.KuBi.auditRecent(log, 12);
        const people = window.KuBi.auditByPerson(log);
        const stamp = function (at) {
          return new Date(at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        };
        return (
          <div className="card audit-card">
            <div className="card-title">{t('audit.title', lang)}</div>
            <p className="module-sub">{t('audit.subtitle', lang)}</p>
            {log.length === 0 ? (
              <p className="module-sub">{t('audit.none', lang)}</p>
            ) : (
              <React.Fragment>
                {people.length ? (
                  <div className="audit-people">
                    {people.map(function (pp) {
                      return (
                        <span key={pp.by} className="audit-person">
                          {pp.by} <b>{pp.changes}</b> {t(pp.changes === 1 ? 'audit.change' : 'audit.changes', lang)}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
                <ul className="audit-list">
                  {recent.map(function (e, i) {
                    return (
                      <li key={i} className="audit-row">
                        <span className="audit-when mono">{stamp(e.at)}</span>
                        <span className="audit-what">
                          {e.by ? <b>{e.by}</b> : null} {t('audit.' + e.action, lang)}
                          {(function () {
                            const label = window.KuBi.auditSubjectLabel(e, { lang: lang, t: t, appointments: appointments });
                            return label ? <span className="audit-subject"> — {label}</span> : null;
                          })()}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {log.length > recent.length ? (
                  <p className="module-sub">+{log.length - recent.length} {t('audit.more', lang)}</p>
                ) : null}
              </React.Fragment>
            )}
          </div>
        );
      })() : null}

      {subtab === 'mis' ? (
        <window.KuBi.MIS
          lang={lang}
          appointments={appointments}
          procedureState={procedureState}
          closedCases={closedCases}
          treatmentChecked={treatmentChecked}
          treatmentCheckedAfter={treatmentCheckedAfter}
          readinessChecked={checked}
          equipmentStatus={equipmentStatus}
          sterPacks={sterPacks}
          clinicStatus={clinicStatus}
          closingChecked={closingChecked}
          attention={attention}
          describe={attentionText}
          goTo={goTo}
        />
      ) : null}
      {/* People is who is here today and who works here — attendance and
          the staff register, stacked. Each module carries its own
          heading, and stacking keeps a staff record two levels deep
          rather than three. */}
      {subtab === 'people' ? (
        <React.Fragment>
          <window.KuBi.AttendanceModule lang={lang} />
          <window.KuBi.EmployeeMaster lang={lang} />
        </React.Fragment>
      ) : null}
    </div>
  );
};
