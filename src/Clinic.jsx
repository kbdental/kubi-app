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

window.KuBi.Clinic = function Clinic({ currentUser, lang, checked, onToggle, clinicStatus, onOpen, onClose, initialSubtab, initialRoom, closingChecked, onToggleClosing, equipmentStatus, onSetEquipment, sterPacks, onAdvancePack, appointments }) {
  const t = window.KuBi.t;
  const RoleBadge = window.KuBi.RoleBadge;
  const SECTIONS = window.KuBi.CLINIC_READINESS;
  const SUBTABS = window.KuBi.CLINIC_SUBTABS;
  const [subtab, setSubtab] = React.useState(initialSubtab || 'opening');
  // Roles that own no checklist sections (e.g. Owner/Admin, who supervises
  // rather than performs) would otherwise land on an empty "My Checklist".
  // Default those users to the full view instead.
  const ownsAnySection = SECTIONS.some(function (s) {
    return s.ownerRole === currentUser.role || s.contingencyRole === currentUser.role;
  });
  const [view, setView] = React.useState(ownsAnySection ? 'mine' : 'all'); // 'mine' | 'all'
  const [activeRoom, setActiveRoom] = React.useState(initialRoom || window.KuBi.CLINIC_ROOMS[0]);
  const [expandedEquip, setExpandedEquip] = React.useState(null);

  React.useEffect(function () {
    if (initialRoom) setActiveRoom(initialRoom);
  }, [initialRoom]);

  React.useEffect(function () {
    if (initialSubtab) setSubtab(initialSubtab);
  }, [initialSubtab]);

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

                {renderSectionCards(visibleSections)}

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

                    {/* Fumigation is an end-of-day protocol, so it lives
                        here rather than with the daily readiness sections. */}
                    {SECTIONS.filter(function (s) { return window.KuBi.CLINIC_SUBTAB_OF[s.id] === 'closing'; }).map(function (section) {
                      return (
                        <div className="card closing-protocol" key={section.id}>
                          <div className="section-header">
                            <div>
                              <div className="card-title">{pick(section.title, lang)}</div>
                              {section.subtitle ? <div className="section-subtitle">{pick(section.subtitle, lang)}</div> : null}
                            </div>
                            <div className="owner-badges">
                              {section.ownerRole ? (
                                <span className="owner-badge-pair">
                                  <span className="owner-label">{t('readiness.owner', lang)}</span>
                                  <RoleBadge roleId={section.ownerRole} lang={lang} />
                                </span>
                              ) : null}
                            </div>
                          </div>
                          {section.groups.map(function (group, gi) {
                            return (
                              <ul className="checklist" key={gi}>
                                {group.tasks.map(function (task, ti) {
                                  const key = window.KuBi.taskKey(section, gi, ti, null);
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
                            );
                          })}
                        </div>
                      );
                    })}
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
                  const sup = window.KuBi.procedureSupplyStatus(a.procedureType, a.id);
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
            </div>
          ) : null}

          <div className="view-toggle sub-tab-row">
            <button className={'toggle-btn' + (view === 'mine' ? ' toggle-btn-active' : '')} onClick={function () { setView('mine'); }}>{t('readiness.myChecklist', lang)}</button>
            <button className={'toggle-btn' + (view === 'all' ? ' toggle-btn-active' : '')} onClick={function () { setView('all'); }}>{t('readiness.fullProcedure', lang)}</button>
          </div>

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
