// Today.jsx — the home screen. Everything here is a live MIRROR of state
// owned elsewhere (CLINIC owns the open/close action and the readiness
// checklist; PATIENTS owns status changes; TREATMENT owns the checklists).
// This screen never lets you change anything except opening the clinic
// when it's closed (via a link into CLINIC) — it's a summary, not a
// second copy of the controls.

window.KuBi = window.KuBi || {};

function timeStr(d) {
  return d ? new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '';
}

// Employee names already carry "Dr." where it applies, so greeting by name
// is right for a dentist and for an assistant alike — no honorific logic,
// and no chance of calling the receptionist "Doctor".
function greetingKey(now) {
  const h = (now || new Date()).getHours();
  if (h < 12) return 'today.goodMorning';
  if (h < 17) return 'today.goodAfternoon';
  return 'today.goodEvening';
}

window.KuBi.Today = function Today({ currentUser, lang, clinicStatus, appointments, checked, treatmentChecked, treatmentCheckedAfter, procedureState, closedCases, closingChecked, equipmentStatus, sterPacks, repairs, labReceived, goTo }) {
  const t = window.KuBi.t;
  const [attentionOpen, setAttentionOpen] = React.useState(false);

  const readiness = window.KuBi.readinessStats(checked);
  const attentionItems = window.KuBi.computeAttentionItems(appointments, treatmentCheckedAfter, checked, clinicStatus, procedureState, closedCases, treatmentChecked, repairs, labReceived);
  // Five, and never a sixth. Past that it stops being "what needs
  // attention" and becomes a to-do list, which staff stop reading. The
  // count above still reports the true total.
  const ATTENTION_SHOWN = 5;
  const attentionShown = attentionItems.slice(0, ATTENTION_SHOWN);
  const attentionHidden = attentionItems.length - attentionShown.length;
  const sortedAppts = appointments.slice().sort(function (a, b) { return a.time.localeCompare(b.time); });

  function attentionText(item) {
    if (item.kind === 'waitingTooLong') return item.patient + ' ' + t('attention.waitingTooLong', lang) + ' ' + item.minutes + ' ' + t('attention.minutes', lang);
    if (item.kind === 'noShow') return item.patient + ' ' + t('attention.noShow', lang);
    if (item.kind === 'roomNotReady') return t('clinic.room', lang) + ' ' + item.room_no + ' ' + t('attention.roomNotReady', lang) + ' (' + item.done + '/' + item.total + ')';
    if (item.kind === 'treatmentNotReady') return item.patient + ' — ' + t('attention.treatmentNotReady', lang) + (item.missing && item.missing.length ? ': ' + item.missing[0] : '');
    if (item.kind === 'caseNotClosed') return item.patient + ' — ' + t('attention.caseNotClosed', lang);
    if (item.kind === 'repairOpen') return item.what + ' — ' + t('attention.repairOpen', lang) + ' (' + item.days + ' ' + t('repair.days', lang) + ')';
    if (item.kind === 'labLate') return item.patient + ' — ' + (item.item[lang] || item.item.en) + ' ' + t('attention.labLate', lang);
    return '';
  }

  function areaLabel(area) {
    return t('nav.' + area, lang).toUpperCase();
  }

  return (
    <div className="module">
      <div className="module-head">
        <h2>{t('nav.today', lang)}</h2>
        <p className="today-greeting">{t(greetingKey(), lang)}, {currentUser.name}</p>
      </div>

      {(function () {
        const na = window.KuBi.nextAction({
          appointments: appointments,
          procedureState: procedureState,
          closedCases: closedCases,
          treatmentChecked: treatmentChecked,
          treatmentCheckedAfter: treatmentCheckedAfter,
          clinicStatus: clinicStatus,
          readinessChecked: checked,
          equipmentStatus: equipmentStatus,
          sterPacks: sterPacks,
          labReceived: labReceived,
        });
        if (na.kind === 'allClear') return null;

        let headline = '';
        let detail = '';
        let cta = '';
        let tone = 'now-neutral';
        let mark = '🔵';

        if (na.kind === 'openClinic') {
          // Not a fault: at 8:40 nobody has done anything wrong. Red is
          // reserved for something actually being wrong, so that when it
          // does appear, staff believe it.
          headline = t('now.clinicClosed', lang);
          cta = t('today.openBtn', lang);
          tone = 'now-neutral'; mark = '🔵';
        } else if (na.kind === 'readinessIncomplete') {
          headline = t('now.readinessIncomplete', lang);
          detail = t('why.reason', lang) + ' ' + na.pending + ' ' + t('now.tasksLeft', lang) + ' — ' +
            (na.section.title[lang] || na.section.title.en) +
            (na.room ? ' (' + t('clinic.room', lang) + ' ' + na.room + ')' : '');
          cta = t('now.finishReadiness', lang);
          // Same reason: a checklist still in progress is the morning
          // going normally, not a problem.
          tone = 'now-neutral'; mark = '🔵';
        } else if (na.kind === 'inProgress') {
          // Who and where on the first line, what on the second. A staff
          // member should get the situation from the headline alone.
          headline = na.appt.patient + ' ' + t('now.isInChair', lang) + ' ' + na.appt.chair;
          detail = na.appt.procedureType + ' — ' + t('now.underway', lang);
          cta = t('proc.completeBtn', lang);
          tone = 'now-live'; mark = '🔵';
        } else if (na.kind === 'needsDocumentation') {
          headline = na.appt.procedureType + ' ' + t('now.finishedNotClosed', lang);
          detail = na.missing.length ? t('treatmentPrep.afterIncomplete', lang) + ' ' + na.missing[0] : '';
          cta = t('now.recordIt', lang);
          tone = 'now-alert'; mark = '🔴';
        } else if (na.kind === 'readyToStart') {
          headline = na.appt.patient + ' ' + t('now.isInChair', lang) + ' ' + na.appt.chair;
          detail = na.appt.procedureType + ' — ' + t('now.readyToStart', lang);
          cta = t('proc.startBtn', lang);
          tone = 'now-good'; mark = '🔵';
        } else if (na.kind === 'notReady') {
          headline = na.appt.patient + ' ' + t('now.isInChair', lang) + ' ' + na.appt.chair;
          // The first thing standing in the way, not all of them. A list of
          // five gives nobody a first move; when this one is done the card
          // names the next.
          detail = na.appt.procedureType + ' — ' + t('treatmentPrep.notReady', lang) +
                   ' · ' + t('treatmentPrep.missing', lang) + ' ' + na.missing[0];
          cta = t('now.sortIt', lang);
          tone = 'now-alert'; mark = '🔴';
        } else if (na.kind === 'chairNotReady') {
          headline = t('clinic.room', lang) + ' ' + na.room + ' ' + t('attention.roomNotReady', lang);
          cta = t('now.makeChairReady', lang);
          tone = 'now-alert'; mark = '🔴';
        } else if (na.kind === 'equipmentDown') {
          const nm = na.equipItem
            ? (na.equipItem.isChair ? t('clinic.room', lang) + ' ' + na.equipItem.room : (na.equipItem.name[lang] || na.equipItem.name.en))
            : '';
          headline = nm + ' — ' + t('now.equipmentDown', lang);
          detail = na.note ? t('why.reason', lang) + ' ' + na.note : '';
          cta = t('now.checkEquipment', lang);
          tone = 'now-alert'; mark = '🔴';
        } else if (na.kind === 'supplyMissing') {
          headline = na.appt.procedureType + ' — ' + t('treatmentPrep.notReady', lang);
          detail = t('why.reason', lang) + ' ' + (na.labMissing ? t('inv.labPending', lang) : (na.missing[0] ? (na.missing[0][lang] || na.missing[0].en) : ''));
          cta = t('now.checkSupplies', lang);
          tone = 'now-alert'; mark = '🔴';
        } else if (na.kind === 'noSterilePacks') {
          headline = t('now.noSterilePacks', lang);
          detail = na.bottleneck ? t('why.reason', lang) + ' ' + na.pending + ' ' + t('ster.packsPending', lang) + ' — ' + t('ster.stage.' + na.bottleneck, lang).toLowerCase() : '';
          cta = t('now.runSterilization', lang);
          tone = 'now-alert'; mark = '🔴';
        } else if (na.kind === 'seatPatient') {
          headline = na.appt.patient + ' ' + t('now.hasArrived', lang);
          detail = na.room
            ? t('now.chairFree', lang) + ' ' + t('clinic.room', lang) + ' ' + na.room
            : t('now.noChairReady', lang);
          cta = t('now.seatThem', lang);
          tone = na.room ? 'now-good' : 'now-alert';
          mark = na.room ? '🔵' : '🔴';
        } else if (na.kind === 'readyToClose') {
          headline = t('now.dayDone', lang);
          cta = t('today.closeBtn', lang);
          tone = 'now-good'; mark = '🔵';
        }

        return (
          <button className={'now-card ' + tone} onClick={function () { goTo(na.area, na.subtab || null, na.apptId || null, na.room || null); }}>
            <div className="now-label">{mark} {t('now.label', lang)}</div>
            <div className="now-headline">{headline}</div>
            {detail ? <div className="now-detail">{detail}</div> : null}
            <div className="now-footer">
              <span className="now-cta"><span className="now-next-label">{t('now.next', lang)}:</span> {cta} →</span>
              {na.owner ? (
                <span className="now-owner">
                  {t('why.owner', lang)} <window.KuBi.RoleBadge roleId={na.owner} lang={lang} />
                </span>
              ) : null}
            </div>
          </button>
        );
      })()}

      <div className="today-secondary">
      <div className="card">
        <div className="card-title">{t('todayHome.patients', lang)}</div>
        {sortedAppts.length === 0 ? <div className="module-sub">{t('todayHome.noAppointments', lang)}</div> : (
          <ul className="checklist today-home-list">
            {sortedAppts.map(function (a) {
              return (
                <li key={a.id} className="check-item today-home-row" onClick={function () { goTo('patients', null, a.id); }}>
                  <span className="mono today-home-time-col">{a.time}</span>
                  <span className="today-home-name">{a.patient}</span>
                  <span className="today-home-sub">{a.treatment}</span>
                  {(function () {
                    const st = window.KuBi.stageLabel(a);
                    return st ? <span className="visit-badge">{st.current}</span> : null;
                  })()}
                  <span className="prep-chair-tag">{t('treatmentPrep.chair', lang)} {a.chair}</span>
                  <span className={'status-pill-small status-select-' + a.status}>{t('checkinStatus.' + a.status, lang)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="card">
        <button className="attention-header" onClick={function () { setAttentionOpen(function (v) { return !v; }); }}>          <div className="card-title">{t('todayHome.attention', lang)}</div>
          {attentionItems.length > 0 ? (
            <span className="attention-count">🔴 {attentionItems.length} {t('todayHome.thingsNeedAttention', lang)}</span>
          ) : (
            <span className="attention-count attention-count-clear">🟢 {t('todayHome.allClear', lang)}</span>
          )}
        </button>
        {attentionOpen && attentionItems.length > 0 ? (
          <ul className="checklist attention-list">
            {attentionShown.map(function (item) {
              return (
                <li key={item.id} className="check-item attention-item" onClick={function () { goTo(item.area, item.subtab || null, item.apptId || null, item.room || null); }}>
                  <span className="attention-area-tag">{areaLabel(item.area)}</span>
                  <span className="attention-body">
                    <span className="attention-text">{attentionText(item)}</span>
                    {item.owner ? (
                      <span className="attention-owner">
                        {t('why.owner', lang)} <window.KuBi.RoleBadge roleId={item.owner} lang={lang} />
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
            {attentionHidden > 0 ? (
              <li className="check-item attention-item attention-more">
                <span className="attention-body">
                  <span className="attention-text">+{attentionHidden} {t('attention.andMore', lang)}</span>
                </span>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      <div className="card">
        <div className="card-title">{t('todayHome.treatment', lang)}</div>
        <div className="chairs-grid">
          {window.KuBi.CHAIRS.map(function (chairNum) {
            const appt = appointments.find(function (a) { return a.chair === chairNum && a.status === 'in_chair'; });
            let tileClass = 'chair-tile chair-empty';
            let label = t('dashboard.chairEmpty', lang);
            let sub = '';
            let why = '';
            if (appt) {
              const s = window.KuBi.treatmentReadyStats(appt.procedureType, treatmentChecked[appt.id] || {});
              tileClass = 'chair-tile ' + (s.ready ? 'chair-ready' : 'chair-not-ready');
              label = s.ready ? '🟢 ' + t('treatmentPrep.ready', lang) : '🔴 ' + t('treatmentPrep.notReady', lang);
              sub = appt.patient;
              if (!s.ready && s.missing.length) {
                why = s.missing.slice(0, 2).join(', ') + (s.missing.length > 2 ? ' +' + (s.missing.length - 2) : '');
              }
            }
            return (
              <button
                key={chairNum}
                className={tileClass}
                onClick={function () {
                  // With a patient in the chair, the question is "is this
                  // treatment ready?" -> TREATMENT. With an empty chair, the
                  // question is "is this room prepared?" -> CLINIC/Equipment.
                  if (appt) {
                    goTo('treatment', 'before', appt.id);
                  } else {
                    goTo('clinic', 'equipment', null, chairNum);
                  }
                }}
              >
                <div className="chair-number">{t('treatmentPrep.chair', lang)} {chairNum}</div>
                <div className="chair-status">{label}</div>
                {sub ? <div className="chair-patient">{sub}</div> : null}
                {why ? <div className="chair-why">{t('why.reason', lang)} {why}</div> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card readiness-summary today-home-top">
        <div className="ready-ring-wrap">
          <svg viewBox="0 0 100 100" className="ready-ring">
            <circle cx="50" cy="50" r="40" className="ready-ring-track" />
            <circle cx="50" cy="50" r="40" className="ready-ring-fill" style={{
              stroke: readiness.pct >= 100 ? 'var(--green)' : readiness.pct >= 50 ? 'var(--teal)' : 'var(--coral)',
              strokeDasharray: 2 * Math.PI * 40,
              strokeDashoffset: 2 * Math.PI * 40 * (1 - readiness.pct / 100),
            }} />
          </svg>
          <div className="ready-ring-label">
            <span className="ready-ring-pct">{readiness.pct}%</span>
            <span className="ready-ring-caption">{t('todayHome.readiness', lang)}</span>
          </div>
        </div>
        <div className="ready-summary-right">
          <div className="dash-card-label">{t('todayHome.clinicStatus', lang)}</div>
          <div className="dash-card-big">
            <span className={'status-dot ' + (clinicStatus.open ? 'status-dot-open' : 'status-dot-closed')} />
            {t(clinicStatus.open ? 'today.openLabel' : 'today.closedLabel', lang)}
            {clinicStatus.open ? <span className="today-home-time">{timeStr(clinicStatus.at)}</span> : null}
          </div>
          {!clinicStatus.open ? (
            <button className="link-btn" onClick={function () { goTo('clinic', 'opening'); }}>{t('todayHome.openInClinic', lang)}</button>
          ) : null}
        </div>
      </div>

      {clinicStatus.open ? (function () {
        const cl = window.KuBi.closingStats(closingChecked);
        return (
          <div className="card">
            <button className="attention-header" onClick={function () { goTo('clinic', 'closing'); }}>
              <div className="card-title">{t('closing.title', lang)}</div>
              <span className={'attention-count' + (cl.canClose ? ' attention-count-clear' : '')}>
                {cl.canClose
                  ? '🟢 ' + t('closing.canClose', lang)
                  : '🔴 ' + cl.blocking.length + ' ' + t('today.stillToDo', lang)}
              </span>
            </button>
          </div>
        );
      })() : null}
      </div>
    </div>
  );
};
