// AttendanceModule.jsx — VIEW-ONLY by design.
// KuBi does not capture attendance. The Management app captures it and
// (eventually) writes it to a Google Sheet; KuBi just reads and displays
// that sheet. Swap window.KuBi.ATTENDANCE for a live sheet fetch later —
// nothing else in this file needs to change.

window.KuBi = window.KuBi || {};

window.KuBi.AttendanceModule = function AttendanceModule({ lang }) {
  const { EMPLOYEES, ATTENDANCE, ATTENDANCE_LAST_SYNCED } = window.KuBi;
  const RoleBadge = window.KuBi.RoleBadge;
  const t = window.KuBi.t;
  const [date, setDate] = React.useState(window.KuBi.operatingDate());

  const dates = Array.from(new Set(ATTENDANCE.map(function (a) { return a.date; }))).sort().reverse();
  const rows = ATTENDANCE.filter(function (a) { return a.date === date; });
  const empById = {};
  EMPLOYEES.forEach(function (e) { empById[e.id] = e; });

  const statusClass = { Present: 'st-present', Late: 'st-late', Absent: 'st-absent', Leave: 'st-leave' };

  return (
    <div className="module">
      <div className="module-head">
        <h2>{t('attendance.title', lang)}</h2>
        <p className="module-sub">
          {t('attendance.subtitle', lang)}
          {ATTENDANCE_LAST_SYNCED ? (
            <span className="synced"> {t('attendance.lastSynced', lang)} {new Date(ATTENDANCE_LAST_SYNCED).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          ) : null}
        </p>
      </div>

      <div className="card">
        <div className="card-title-row">
          <div className="card-title">{t('attendance.dailyLog', lang)}</div>
          <select className="date-select" value={date} onChange={function (e) { setDate(e.target.value); }}>
            {dates.map(function (d) { return <option key={d} value={d}>{d}</option>; })}
          </select>
        </div>
        <table className="kb-table">
          <thead>
            <tr>
              <th>{t('attendance.employee', lang)}</th>
              <th>{t('employee.role', lang)}</th>
              <th>{t('attendance.timeIn', lang)}</th>
              <th>{t('attendance.status', lang)}</th>
              <th>{t('attendance.lateReason', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(function (a) {
              const emp = empById[a.empId];
              if (!emp) return null;
              return (
                <tr key={a.empId + a.date}>
                  <td>{emp.name}</td>
                  <td><RoleBadge roleId={emp.role} lang={lang} /></td>
                  <td className="mono">{a.timeIn || '—'}</td>
                  <td><span className={'status-pill ' + statusClass[a.status]}>{t('status.' + a.status, lang)}</span></td>
                  <td className="reason">{a.lateReason || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
