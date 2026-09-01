// Clinic.jsx — the CLINIC area. Sub-tabs: Opening, Readiness, Equipment,
// Sterilization, Inventory, Housekeeping. The first is the actual
// open/close action (moved here from the old standalone Today tab);
// the rest are the Clinic Readiness checklist sections, grouped by
// CLINIC_SUBTAB_OF instead of shown as one long scroll.

window.KuBi = window.KuBi || {};

function pick(field, lang) {
  if (!field) return '';
  return field[lang] || field.en;
}

window.KuBi.Clinic = function Clinic({ currentUser, lang, checked, onToggle, clinicStatus, onOpen, onClose, initialSubtab, initialRoom, closingChecked, onToggleClosing, equipmentStatus, onSetEquipment, sterPacks, onAdvancePack, repairs, onReportRepair, onRepairFixed, appointments }) {
  const t = window.KuBi.t;
  const RoleBadge = window.KuBi.RoleBadge;
  const SECTIONS = window.KuBi.CLINIC_READINESS;
  const SUBTABS = window.KuBi.CLINIC_SUBTABS;
  // Opening is a means, not a destination: once the clinic is open that tab
  // has nothing left to do, so land on Readiness — the actual next work —
  // rather than parking staff on a status card.
  const [subtab, setSubtab] = React.useState(initialSubtab || (clinicStatus.open ? 'readiness' : 'opening'));
  // Roles that own no checklist sections (e.g. Owner/Admin, who supervises
  // rather than performs) would otherwise land on an empty "My Checklist".
  // Default those users to the full view instead.
  const ownsAnySection = SECTIONS.some(function (s) {
    return s.ownerRole === currentUser.role || s.contingencyRole === currentUser.role;
  });
  const [view, setView] = React.useState(ownsAnySection ? 'mine' : 'all'); // 'mine' | 'all'
  const [activeRoom, setActiveRoom] = React.useState(initialRoom || window.KuBi.CLINIC_ROOMS[0]);
  const [expandedEquip, setExpandedEquip] = React.useState(null);
  const [repairForm, setRepairForm] = React.useState(null); // null = form closed

  React.useEffect(function () {
    if (initialRoom) setActiveRoom(initialRoom);
  }, [initialRoom]);

  React.useEffect(function () {
    if (initialSubtab) setSubtab(initialSubtab);
  }, [initialSubtab]);

  // Same reason, for the moment of opening itself: when the clinic flips
  // open while the user is sitting on Opening, move them on. Only on the
  // transition, so anyone who deliberately picks Opening later can stay.
  const wasOpen = React.useRef(clinicStatus.open);
  React.useEffect(function () {
    if (!wasOpen.current && clinicStatus.open && subtab === 'opening') setSubtab('readiness');
    wasOpen.current = clinicStatus.open;
  }, [clinicStatus.open]);

  function isMine(section) {
    return !section.ownerRole || section.ownerRole === currentUser.role || section.contingencyRole === currentUser.role;
  }

  function allTasks(section) {
    const out = [];
    section.groups.forEach(function (g, gi) {
      g.tasks.forEach(function (t2, ti) {
        out.push({ key: window.KuBi.taskKey(section, gi, ti, section.perRoom ? activeRoom : null) });
      });
    });
    return out;
  }

  const sectionsForTab = SECTIONS.filter(function (s) { return window.KuBi.CLINIC_SUBTAB_OF[s.id] === subtab; });
  const visibleSections = sectionsForTab.filter(function (s) { return view === 'all' || isMine(s); });

  // Renders the checklist cards for whichever sub-tab is active. Extracted
  // so the Closing tab can show its own tasks (fumigation) alongside the
  // closing gate, without duplicating this markup.
  function renderSectionCards(list) {
    return list.map(function (section) {
      const flat = allTasks(section);
      const done = flat.filter(function (it) { return checked[it.key]; }).length;
      return (
        <div className="card" key={section.id}>
          {section.perRoom ? (
            <div className="room-tab-row">
              {window.KuBi.CLINIC_ROOMS.map(function (room) {
                const rs = window.KuBi.roomStats(section, room, checked);
                return (
                  <button
                    key={room}
                    className={'room-tab' + (activeRoom === room ? ' room-tab-active' : '') + (rs.ready ? ' room-tab-ready' : '')}
                    onClick={function () { setActiveRoom(room); }}
                  >
                    <span className="room-tab-dot">{rs.ready ? '🟢' : '🔴'}</span>
                    {t('clinic.room', lang)} {room}
                    <span className="room-tab-count">{rs.ready ? rs.total + '/' + rs.total : (rs.total - rs.done) + ' ' + t('why.left', lang)}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="section-header">
            <div>
              <div className="card-title">{pick(section.title, lang)}</div>
              {section.subtitle ? <div className="section-subtitle">{pick(section.subtitle, lang)}</div> : null}
            </div>
            <div className="owner-badges">
              {!section.ownerRole
                ? <span className="all-staff-tag">{t('readiness.allStaff', lang)}</span>
                : (
                  <React.Fragment>
                    <span className="owner-badge-pair">
                      <span className="owner-label">{t('readiness.owner', lang)}</span>
                      <RoleBadge roleId={section.ownerRole} lang={lang} />
                    </span>
                    {section.contingencyRole ? (
                      <span className="owner-badge-pair contingency">
                        <span className="owner-label">{t('readiness.backup', lang)}</span>
                        <RoleBadge roleId={section.contingencyRole} lang={lang} />
                      </span>
                    ) : null}
                  </React.Fragment>
                )}
            </div>
          </div>
          <div className="section-progress">{done} / {flat.length} {t('readiness.tasksDone', lang)}</div>

          {section.groups.map(function (group, gi) {
            return (
              <div key={gi} className={group.title ? 'subsection' : ''}>
                {group.title ? <div className="subsection-title">{pick(group.title, lang)}</div> : null}
                <ul className="checklist">
                  {group.tasks.map(function (task, ti) {
                    const key = window.KuBi.taskKey(section, gi, ti, section.perRoom ? activeRoom : null);
                    const c = checked[key];
                    return (
                      <li key={key} className={c ? 'check-item check-item-done' : 'check-item'}>
                        <label>
                          <input type="checkbox" checked={!!c} onChange={function () { onToggle(key, currentUser.name); }} />
                          <span className="task-block">
                            <span className="task-label">{pick(task.label, lang)}</span>
                            {task.details && task.details.length ? (
                              <span className="task-details">
                                {task.details.map(function (d, di) { return <span key={di} className="task-detail-line">{pick(d, lang)}</span>; })}
                              </span>
                            ) : null}
                          </span>
                        </label>
                        {c ? <span className="checked-by">✓ {c.by}</span> : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}

          {section.note ? <div className="section-note">{pick(section.note, lang)}</div> : null}
        </div>
      );
    });
  }

  return (
    <div className="module">
      <div className="module-head">
        <h2>{t('nav.clinic', lang)}</h2>
      </div>

      <div className="view-toggle sub-tab-row">
        {SUBTABS.map(function (st) {
          return (
            <button key={st} className={'toggle-btn' + (subtab === st ? ' toggle-btn-active' : '')} onClick={function () { setSubtab(st); }}>
              {t('clinic.tab.' + st, lang)}
            </button>
          );
        })}
      </div>

      {subtab === 'opening' ? (
        <div className={'today-card ' + (clinicStatus.open ? 'today-open' : '')}>
          <div className="today-eyebrow">
            <span className={'status-dot ' + (clinicStatus.open ? 'status-dot-open' : 'status-dot-closed')} />
            {t(clinicStatus.open ? 'today.openLabel' : 'today.closedLabel', lang)}
          </div>
          {clinicStatus.open ? (
            <React.Fragment>
              <h1 className="today-heading">{t('today.openTitle', lang)}</h1>
              <p className="today-sub">{t('today.openedBy', lang)} {clinicStatus.by}</p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h1 className="today-heading">{t('today.title', lang)}</h1>
              <p className="today-sub">{t('today.nobody', lang)}</p>
              <button className="btn-primary today-btn" onClick={onOpen}>{t('today.openBtn', lang)}</button>
            </React.Fragment>
          )}
        </div>
      ) : subtab === 'closing' ? (
        <React.Fragment>
          {(function () {
            const stats = window.KuBi.closingStats(closingChecked);
            const nonCriticalPending = stats.pending.filter(function (it) { return !it.critical; });
            return (
              <React.Fragment>
                <div className="kubi-bubble-row">
                  <div className="kubi-avatar">Ku</div>
                  <div className="kubi-bubble">{t('closing.subtitle', lang)}</div>
                </div>

                {/* sectionsForTab, NOT visibleSections: the closing tab has
                    no My Checklist / Full Procedure toggle, so filtering by
                    who owns the section would hide fumigation from everyone
                    who does not own it — including the Clinic Manager, who
                    is the one closing up. */}
                {renderSectionCards(sectionsForTab)}

                {!clinicStatus.open ? (
                  <div className="card"><p className="module-sub">{t('closing.openFirst', lang)}</p></div>
                ) : (
                  <React.Fragment>
                    <div className={'kubi-bubble-row kubi-verdict-row ' + (stats.canClose ? 'kubi-verdict-good' : 'kubi-verdict-bad')}>
                      <div className="kubi-avatar">Ku</div>
                      <div className="kubi-bubble kubi-verdict-bubble">
                        <div className="kubi-verdict-line">
                          {stats.canClose ? '🟢 ' + t('closing.canClose', lang) : '🔴 ' + t('closing.cannotClose', lang)}
                        </div>
                        {!stats.canClose ? (
                          <div className="kubi-verdict-sub">
                            {t('why.reason', lang)} {stats.blocking.length} {stats.blocking.length === 1 ? t('closing.criticalItem', lang) : t('closing.criticalItems', lang)} — {stats.blocking.map(function (b) { return pick(b.check, lang); }).join(', ')}
                          </div>
                        ) : nonCriticalPending.length > 0 ? (
                          <div className="kubi-verdict-sub">
                            {t('closing.warnPending', lang)} {nonCriticalPending.map(function (b) { return pick(b.check, lang); }).join(', ')}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="card">
                      <div className="section-progress">{stats.done} / {stats.total} {t('readiness.tasksDone', lang)}</div>
                      <ul className="checklist kubi-checklist">
                        {window.KuBi.CLINIC_CLOSING.map(function (item) {
                          const c = closingChecked[item.id];
                          return (
                            <li key={item.id} className={c ? 'check-item check-item-done' : 'check-item'}>
                              <label>
                                <input type="checkbox" checked={!!c} onChange={function () { onToggleClosing(item.id); }} />
                                <span className="task-block">
                                  <span className="task-label">
                                    <span className="closing-area">{pick(item.area, lang)}</span>
                                    {pick(item.check, lang)}
                                  </span>
                                </span>
                              </label>
                              {item.critical && !c ? <span className="closing-must">{t('closing.mustDo', lang)}</span> : null}
                              {c ? <span className="checked-by">✓</span> : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    <button
                      className={stats.canClose ? 'btn-primary today-btn' : 'btn-primary today-btn btn-disabled'}
                      disabled={!stats.canClose}
                      onClick={function () { if (stats.canClose) onClose(); }}
                    >
                      {t('today.closeBtn', lang)}
                    </button>
                  </React.Fragment>
                )}
              </React.Fragment>
            );
          })()}
        </React.Fragment>
      ) : (
        <React.Fragment>
          {subtab === 'equipment' ? (
            <div className="card">
              <div className="card-title">{t('equip.today', lang)}</div>
              <ul className="equip-list">
                {window.KuBi.equipmentList(lang).map(function (item) {
                  const st = (equipmentStatus || {})[item.id] || { ok: true };
                  const label = item.isChair ? t('clinic.room', lang) + ' ' + item.room : pick(item.name, lang);
                  const isOpen = expandedEquip === item.id;
                  return (
                    <li key={item.id} className={'equip-row' + (st.ok ? '' : ' equip-row-issue')}>
                      <button className="equip-head" onClick={function () { setExpandedEquip(isOpen ? null : item.id); }}>
                        <span className="equip-dot">{st.ok ? '🟢' : '🔴'}</span>
                        <span className="equip-name">{label}</span>
                        {!st.ok && st.note ? <span className="equip-note">{t('why.reason', lang)} {st.note}</span> : null}
                        <span className="equip-chev">{isOpen ? '▲' : '▼'}</span>
                      </button>
                      {isOpen ? (
                        <div className="equip-detail">
                          <div className="equip-actions">
                            <button
                              className={'toggle-btn' + (st.ok ? ' toggle-btn-active' : '')}
                              onClick={function () { onSetEquipment(item.id, true, ''); }}
                            >🟢 {t('equip.ok', lang)}</button>
                            <button
                              className={'toggle-btn' + (!st.ok ? ' toggle-btn-active' : '')}
                              onClick={function () { onSetEquipment(item.id, false, st.note || ''); }}
                            >🔴 {t('equip.issue', lang)}</button>
                          </div>
                          {!st.ok ? (
                            <input
                              className="equip-note-input"
                              type="text"
                              placeholder={t('equip.notePlaceholder', lang)}
                              value={st.note || ''}
                              onChange={function (e) { onSetEquipment(item.id, false, e.target.value); }}
                            />
                          ) : null}
                          {st.at ? (
                            <div className="equip-meta">
                              {t('equip.lastUpdated', lang)} {new Date(st.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                              {st.by ? ' · ' + st.by : ''}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {subtab === 'sterilization' ? (function () {
            const st = window.KuBi.sterStats(sterPacks);
            const canDetail = window.KuBi.canSeeSterDetail(currentUser.role);
            return (
              <div className="card">
                <div className="card-title">{t('ster.title', lang)}</div>
                <div className={'ster-summary ' + (st.ready ? 'ster-ready' : 'ster-pending')}>
                  <span>
                    {st.ready
                      ? '🟢 ' + t('ster.ready', lang)
                      : '🔴 ' + st.pending + ' ' + t('ster.packsPending', lang)}
                    {!st.ready ? (function () {
                      // Name the stage holding things up — the earliest
                      // incomplete stage is the actual bottleneck.
                      const stuck = {};
                      sterPacks.forEach(function (p) {
                        if (p.stage !== 'available') stuck[p.stage] = (stuck[p.stage] || 0) + 1;
                      });
                      const order = window.KuBi.STER_STAGES;
                      let worst = null;
                      order.forEach(function (s2) { if (!worst && stuck[s2]) worst = s2; });
                      return worst ? <span className="ster-why">{t('why.reason', lang)} {t('ster.stage.' + worst, lang).toLowerCase()}</span> : null;
                    })() : null}
                  </span>
                  <span className="ster-avail">{st.available} {t('ster.available', lang)}</span>
                </div>

                {canDetail ? (
                  <ul className="ster-list">
                    {sterPacks.map(function (p) {
                      const nextStage = window.KuBi.nextSterStage(p.stage);
                      return (
                        <li key={p.id} className="ster-row">
                          <span className="mono ster-id">{p.id}</span>
                          <span className="ster-contents">{p.contents}</span>
                          <span className={'ster-stage ster-stage-' + p.stage}>{t('ster.stage.' + p.stage, lang)}</span>
                          <span className="ster-when">
                            {new Date(p.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                            {p.by ? ' · ' + p.by : ''}
                          </span>
                          {nextStage ? (
                            <button className="ster-advance" onClick={function () { onAdvancePack(p.id); }}>
                              → {t('ster.stage.' + nextStage, lang)}
                            </button>
                          ) : <span className="ster-advance-done">✓</span>}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="module-sub">{t('ster.summaryOnly', lang)}</p>
                )}
              </div>
            );
          })() : null}

          {subtab === 'inventory' ? (
            <div className="card">
              <div className="card-title">{t('inv.title', lang)}</div>
              <p className="module-sub">{t('inv.subtitle', lang)}</p>
              <ul className="inv-list">
                {(appointments || []).slice().sort(function (a, b) { return a.time.localeCompare(b.time); }).map(function (a) {
                  const sup = window.KuBi.procedureSupplyStatus(a.procedureType, a);
                  const parts = [];
                  if (sup.blocking.length) parts.push(sup.blocking.map(function (m) { return pick(m.name, lang) + ' — ' + t('inv.out', lang); }).join(', '));
                  if (sup.labMissing) parts.push(t('inv.labPending', lang));
                  if (sup.low.length) parts.push(sup.low.map(function (m) { return pick(m.name, lang) + ' — ' + t('inv.low', lang); }).join(', '));
                  if (sup.lab && sup.lab.received) parts.push(pick(sup.lab.item, lang) + ' — ' + t('inv.labReceived', lang));
                  return (
                    <li key={a.id} className={'inv-row' + (sup.ok ? '' : ' inv-row-blocked')}>
                      <span className="inv-dot">{sup.ok ? '🟢' : '🔴'}</span>
                      <span className="inv-proc">{a.procedureType}</span>
                      <span className="inv-patient">{a.patient}</span>
                      <span className="inv-detail">{parts.length ? parts.join(' · ') : t('inv.allAvailable', lang)}</span>
                    </li>
                  );
                })}
              </ul>

              {/* What is coming. Staff see READY / LOW / NOT AVAILABLE and
                  nothing else — the quantities behind these exist so KuBi
                  can work this out, not to be read off a screen mid-clinic.
                  Only problems are listed: a list of everything that is
                  fine is a list nobody reads. */}
              {(function () {
                const outlook = window.KuBi.supplyOutlook(appointments);
                const period = function (labelKey, rows) {
                  return (
                    <div className="inv-period">
                      <span className="inv-period-label">{t(labelKey, lang)}</span>
                      {rows.length === 0 ? (
                        <span className="inv-period-ok">🟢 {t('inv.allReady', lang)}</span>
                      ) : (
                        <span className="inv-period-rows">
                          {rows.map(function (r) {
                            return (
                              <span key={r.material.id} className={'inv-period-row inv-' + r.state}>
                                {r.state === 'out' ? '🔴 ' : '🟠 '}
                                {pick(r.material.name, lang)} — {t(r.state === 'out' ? 'inv.notAvailable' : 'inv.isLow', lang)}
                                <span className="inv-period-for"> {t('inv.forTreatments', lang)} {r.forTypes.join(', ')}</span>
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </div>
                  );
                };
                return (
                  <div className="inv-outlook">
                    <div className="card-title">{t('inv.outlook', lang)}</div>
                    {period('inv.today', outlook.today)}
                    {period('inv.tomorrow', outlook.tomorrow)}
                    {period('inv.thisWeek', outlook.week)}
                    <div className="inv-period">
                      <span className="inv-period-label">{t('inv.expiring', lang)}</span>
                      {outlook.expiring.length === 0 ? (
                        <span className="inv-period-ok">{t('inv.expiringNone', lang)}</span>
                      ) : (
                        <span className="inv-period-rows">
                          {outlook.expiring.map(function (e) {
                            return (
                              <span key={e.material.id + e.batch.id}
                                    className={'inv-period-row' + (e.expired ? ' inv-out' : '')}>
                                {e.expired ? '🔴 ' : '🟠 '}
                                {pick(e.material.name, lang)}
                                <span className="inv-period-for">
                                  {' '}{e.expired
                                    ? t('inv.expired', lang)
                                    : t('inv.expiresIn', lang) + ' ' + e.daysLeft + ' ' + t('inv.days', lang)}
                                </span>
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </div>

                    <div className="inv-reorder">
                      <span className="inv-period-label">{t('inv.reorder', lang)}</span>
                      {outlook.reorder.length === 0 ? (
                        <span className="inv-period-ok">{t('inv.reorderNone', lang)}</span>
                      ) : (
                        <span className="inv-period-rows">
                          {outlook.reorder.map(function (m) {
                            return <span key={m.id} className="inv-period-row">{pick(m.name, lang)}</span>;
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}

          <div className="view-toggle sub-tab-row">
            <button className={'toggle-btn' + (view === 'mine' ? ' toggle-btn-active' : '')} onClick={function () { setView('mine'); }}>{t('readiness.myChecklist', lang)}</button>
            <button className={'toggle-btn' + (view === 'all' ? ' toggle-btn-active' : '')} onClick={function () { setView('all'); }}>{t('readiness.fullProcedure', lang)}</button>
          </div>

          {/* Repairs sit above the housekeeping checklist: the checklist
              can only record that a fault was noticed, this is what keeps
              it visible until somebody fixes it. */}
          {subtab === 'housekeeping' ? (function () {
            const all = window.KuBi.repairsByAge(repairs || []);
            const open = window.KuBi.openRepairs(all);
            return (
              <div className="card repair-card">
                <div className="card-title">
                  {t('repair.title', lang)}
                  {open.length ? <span className="repair-count">{open.length} {t('repair.openCount', lang)}</span> : null}
                </div>
                <p className="module-sub">{t('repair.subtitle', lang)}</p>

                {open.length === 0 ? (
                  <p className="module-sub">{t('repair.none', lang)}</p>
                ) : (
                  <ul className="repair-list">
                    {open.map(function (r) {
                      const days = window.KuBi.repairAgeDays(r);
                      const late = window.KuBi.repairIsOverdue(r);
                      return (
                        <li key={r.id} className={'repair-row' + (late ? ' repair-row-late' : '')}>
                          <span className="repair-dot">{late ? '🔴' : '🟡'}</span>
                          <span className="repair-body">
                            <span className="repair-what">{r.what}</span>
                            <span className="repair-meta">
                              {window.KuBi.repairPlaceLabel(r.place, lang, t)} · {window.KuBi.repairKindLabel(r.kind, lang)} · {r.by}
                              {' · '}
                              {days === 0 ? t('repair.today', lang) : t('repair.openFor', lang) + ' ' + days + ' ' + t('repair.days', lang)}
                            </span>
                          </span>
                          <button className="rowbtn" onClick={function () { onRepairFixed(r.id); }}>{t('repair.markDone', lang)}</button>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {repairForm ? (
                  <div className="repair-form">
                    <label className="prep-row-label">{t('repair.what', lang)}</label>
                    <input
                      className="repair-input" type="text" value={repairForm.what}
                      onChange={function (e) { setRepairForm(Object.assign({}, repairForm, { what: e.target.value })); }}
                    />
                    <div className="repair-form-row">
                      <span>
                        <label className="prep-row-label">{t('repair.where', lang)}</label>
                        <select
                          className="proc-select" value={repairForm.place}
                          onChange={function (e) { setRepairForm(Object.assign({}, repairForm, { place: e.target.value })); }}
                        >
                          {window.KuBi.REPAIR_PLACES().map(function (pl) {
                            return <option key={pl.id} value={pl.id}>{window.KuBi.repairPlaceLabel(pl.id, lang, t)}</option>;
                          })}
                        </select>
                      </span>
                      <span>
                        <label className="prep-row-label">{t('repair.kind', lang)}</label>
                        <select
                          className="proc-select" value={repairForm.kind}
                          onChange={function (e) { setRepairForm(Object.assign({}, repairForm, { kind: e.target.value })); }}
                        >
                          {window.KuBi.REPAIR_KINDS.map(function (k) {
                            return <option key={k.id} value={k.id}>{window.KuBi.repairKindLabel(k.id, lang)}</option>;
                          })}
                        </select>
                      </span>
                    </div>
                    <div className="repair-form-actions">
                      <button
                        className={'btn-primary today-btn' + (repairForm.what.trim() ? '' : ' btn-disabled')}
                        disabled={!repairForm.what.trim()}
                        onClick={function () {
                          onReportRepair(repairForm.kind, repairForm.place, repairForm.what.trim());
                          setRepairForm(null);
                        }}
                      >{t('repair.save', lang)}</button>
                      <button className="rowbtn" onClick={function () { setRepairForm(null); }}>{t('repair.cancel', lang)}</button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="btn-primary today-btn repair-open-btn"
                    onClick={function () { setRepairForm({ what: '', place: window.KuBi.REPAIR_PLACES()[0].id, kind: 'plumbing' }); }}
                  >{t('repair.report', lang)}</button>
                )}
              </div>
            );
          })() : null}

          {visibleSections.length === 0 ? (
            <div className="card empty-tab-notice">
              <p className="module-sub">{t('clinic.nothingForYou', lang)}</p>
              <button className="btn-primary today-btn" onClick={function () { setView('all'); }}>{t('readiness.fullProcedure', lang)}</button>
            </div>
          ) : null}

          {renderSectionCards(visibleSections)}
        </React.Fragment>
      )}
    </div>
  );
};
