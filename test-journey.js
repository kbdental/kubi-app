// Full-journey test: drives the app through an entire clinic day and
// asserts the state transitions at each step.
const { JSDOM } = require('jsdom');
const fs = require('fs');

const dom = new JSDOM('<!DOCTYPE html><body><div id="root"></div></body>', {
  runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
w.eval(fs.readFileSync('vendor/react.development.js', 'utf8'));
w.eval(fs.readFileSync('vendor/react-dom.development.js', 'utf8'));

const errors = [];
w.addEventListener('error', e => errors.push(e.message));
w.console.error = function () {
  const s = Array.from(arguments).join(' ');
  if (/error occurred|Warning: Each child|Cannot read/.test(s)) errors.push(s.split('\n')[0]);
};

// Compile src/ the same way build.js does, so the test always runs
// against current source rather than a stale build artifact.
const babel = require('@babel/core');
const FILES = require('./build-files.js');
let appCode = '';
for (const f of FILES) {
  appCode += babel.transformSync(fs.readFileSync(f, 'utf8'), {
    presets: [[require.resolve('@babel/preset-react'), { runtime: 'classic', development: false }]],
    filename: f,
  }).code + '\n';
}
w.eval(appCode);

const doc = () => w.document;
const click = el => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const text = () => doc().getElementById('root').textContent;
const btnByText = re => Array.from(doc().querySelectorAll('button')).find(b => re.test(b.textContent));
const navByText = re => Array.from(doc().querySelectorAll('.nav-item')).find(b => re.test(b.textContent));

const results = [];
function check(label, pass, detail) {
  results.push({ label, pass, detail });
  console.log((pass ? 'PASS  ' : 'FAIL  ') + label + (detail ? '   [' + detail + ']' : ''));
}

function login(pin) {
  const el = doc().getElementById('pin');
  w.Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(el, pin);
  el.dispatchEvent(new w.Event('input', { bubbles: true }));
  doc().querySelector('form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
}

function step(fn, delay) { return new Promise(r => setTimeout(() => { fn(); r(); }, delay || 160)); }

(async function run() {
  await step(() => {}, 300);

  // 1. LOGIN
  await step(() => login('0000'));
  check('Login as Owner/Admin', /Today/.test(text()) && !!navByText(/Today/));

  // 2. NAV — all six areas
  const navs = Array.from(doc().querySelectorAll('.nav-item')).map(n => n.textContent);
  check('Five top-level areas present', navs.length === 5, navs.join(' | '));
  check('MIS is not a top-level area', !navs.some(n => /MIS/.test(n)), navs.join(' | '));

  // 3. NOW card says clinic closed
  check('NOW card prompts to open clinic', /isn.t open yet|Open the Clinic/i.test(text()));
  check('Today greets the person signed in', /Good (morning|afternoon|evening), Viveyk/.test(text()));

  // Not just the label: the card must carry the action the engine chose.
  // Matching "NEXT:" alone would pass with the action missing entirely.
  const nowCta = (doc().querySelector('.now-cta') || {}).textContent || '';
  check('NOW card names the actual next step',
        /NEXT:/.test(nowCta) && /Open the Clinic/.test(nowCta), nowCta.replace(/\s+/g, ' ').trim());

  // Hierarchy, read from the DOM in render order rather than by searching
  // text. Attention must sit ABOVE the chair tiles and the readiness ring —
  // that is what this change actually moved, and a text search for
  // "NOW < Patients < Attention" was true before it too.
  const cardTitles = Array.from(doc().querySelectorAll('.main .card .card-title')).map(e => e.textContent.trim());
  const at = label => cardTitles.findIndex(x => new RegExp(label, 'i').test(x));
  check('Patients and attention sit above the reference cards',
        at('Patients') >= 0 && at('Attention') > at('Patients') && at('Treatment') > at('Attention'),
        cardTitles.join(' | '));
  // Red means something is wrong. A clinic that simply has not opened yet
  // is not a fault, and must not borrow the colour of one.
  const nowCls = (doc().querySelector('.now-card') || {}).className || '';
  check('Clinic-not-open is not shown as an alert', !/now-alert/.test(nowCls), nowCls.trim());

  // 4. OPEN THE CLINIC via Clinic area
  await step(() => click(navByText(/Clinic$/)));
  await step(() => click(btnByText(/^Open the Clinic/)));
  check('Clinic opened', /Clinic is Open|Clinic Open/i.test(text()));

  // 5. CLINIC sub-tabs all render
  const subTabs = Array.from(doc().querySelectorAll('.toggle-btn')).map(b => b.textContent);
  check('Clinic sub-tabs render', subTabs.length >= 7, subTabs.slice(0, 8).join(', '));

  // 5b. Opening the clinic hands over to Readiness rather than parking on
  //     the "Clinic is Open" card, which has nothing left to act on.
  await step(() => {});
  const activeSub = () => {
    const b = doc().querySelector('.sub-tab-row .toggle-btn-active');
    return b ? b.textContent : '(none)';
  };
  check('Opening the clinic moves to Readiness', /Readiness/.test(activeSub()), activeSub());

  // The open/close action must stay reachable: picking Opening by hand works.
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => /Opening/.test(b.textContent))));
  check('Opening stays selectable once open', /Opening/.test(activeSub()) && /Clinic is Open/i.test(text()), activeSub());

  // 6. EQUIPMENT tab — room tabs + equipment list
  await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => /Equipment/.test(b.textContent))));
  check('Equipment list present', /Autoclave|Compressor/.test(text()));
  check('Per-room tabs present', doc().querySelectorAll('.room-tab').length === 4,
        doc().querySelectorAll('.room-tab').length + ' rooms');

  // 7. STERILIZATION tab
  await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => /Sterilization/.test(b.textContent))));
  check('Sterilization pack list present', /PK-10|packs pending|Ready/i.test(text()));

  // 8. INVENTORY tab
  await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => /Inventory/.test(b.textContent))));
  check('Inventory shows per-treatment readiness', /Gutta percha|Everything available|lab case/i.test(text()));

  // 9. HOUSEKEEPING — floor cleaning + biomedical waste live here
  await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => /Housekeeping/.test(b.textContent))));
  check('Floor cleaning under Housekeeping', /Floor Cleaning/i.test(text()));
  check('Bio-medical waste under Housekeeping', /Bio-Medical Waste/i.test(text()));
  check('Utilities under Housekeeping', /Utilities & Energy/i.test(text()));
  check('AC temperature is on the checklist', /24°C/.test(text()));
  check('Water pump is on the checklist', /water pump/i.test(text()));
  check('Fixtures & repairs under Housekeeping', /Fixtures & Repairs/i.test(text()));

  // 10b. REPAIRS — a fault stays visible until somebody fixes it.
  check('Repairs card under Housekeeping', /Repairs/i.test(text()));
  check('Seeded fault is listed', /Tap dripping/i.test(text()));
  const openRepairRows = () => doc().querySelectorAll('.repair-row').length;
  const before = openRepairRows();
  await step(() => click(btnByText(/^Report a fault/)));
  check('Report form opens', !!doc().querySelector('.repair-input'));
  await step(() => {
    const inp = doc().querySelector('.repair-input');
    w.Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set.call(inp, 'Switch board loose in Clinic 2');
    inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  });
  await step(() => click(btnByText(/^Report it$/)));
  check('Reported fault is listed', openRepairRows() === before + 1 && /Switch board loose/.test(text()),
        openRepairRows() + ' open');
  await step(() => click(Array.from(doc().querySelectorAll('.repair-row')).find(r => /Switch board loose/.test(r.textContent)).querySelector('button')));
  check('Fixed fault leaves the list', !/Switch board loose/.test(text()) && openRepairRows() === before,
        openRepairRows() + ' open');

  // 10. CLOSING — fumigation lives here
  await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => /Closing/.test(b.textContent))));
  check('Closing gate present', /Clinic Cannot Close|Clinic May Close/i.test(text()));
  check('Fumigation under Closing', /Fumigation/i.test(text()));
  // It was rendered twice: once by the shared section renderer and again by
  // a bespoke copy of the same markup. Presence alone could not see that.
  check('Fumigation appears exactly once',
        (text().match(/Fumigation Protocol/g) || []).length === 1,
        (text().match(/Fumigation Protocol/g) || []).length + ' copies');
  check('Lights and AC on the closing gate', /Lights, fans & AC/i.test(text()));

  // 11. PATIENT JOURNEY
  await step(() => click(navByText(/Patient Journey/)));
  check('Journey strips render', doc().querySelectorAll('.journey-strip').length > 0,
        doc().querySelectorAll('.journey-strip').length + ' strips');
  check('Whole-treatment strip renders', doc().querySelectorAll('.case-strip').length > 0,
        doc().querySelectorAll('.case-strip').length + ' case strips');

  // 12. FOLLOW-UP tab
  await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => /Follow-up/.test(b.textContent))));
  check('Follow-up list renders', /Sanjay|Vikram|due back/i.test(text()));

  // 12b. LAB — what is out at the lab, and what is late
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => b.textContent.trim() === 'Lab')));
  check('Lab tab renders', /Lab work|out at the lab/i.test(text()));
  check('Late lab case is flagged', /Late/i.test(text()) && /Vikram Shah/.test(text()));
  const labRows = () => doc().querySelectorAll('.fu-row').length;
  const awaitedBefore = Array.from(doc().querySelectorAll('.fu-row')).filter(r => /Mark received/.test(r.textContent)).length;
  await step(() => click(Array.from(doc().querySelectorAll('.fu-row')).find(r => /Vikram Shah/.test(r.textContent)).querySelector('button')));
  const awaitedAfter = Array.from(doc().querySelectorAll('.fu-row')).filter(r => /Mark received/.test(r.textContent)).length;
  check('Marking a case received clears it', awaitedAfter === awaitedBefore - 1 && labRows() > 0,
        awaitedBefore + ' -> ' + awaitedAfter + ' awaited');

  // 12c. NOT RETURNED — people the clinic stopped hearing from
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => /Not returned/.test(b.textContent))));
  check('Not-returned tab renders', /stopped coming/i.test(text()));
  check('Both kinds of silence are distinguished',
        /Advised, never started/i.test(text()) && /Started, not finished/i.test(text()));
  check('Recently-seen patients are not listed', !/Sunita Rao/.test(text()));

  // 13. TREATMENT — before checklist
  await step(() => click(navByText(/Treatment/)));
  check('Treatment rows render', doc().querySelectorAll('.prep-appt-row').length > 0,
        doc().querySelectorAll('.prep-appt-row').length + ' rows');

  // Expand first patient and tick every before-item
  await step(() => click(doc().querySelector('.prep-appt-row')));
  const boxes = () => Array.from(doc().querySelectorAll('.kubi-checklist input[type=checkbox]'));
  check('Before checklist expands', boxes().length > 0, boxes().length + ' items');

  for (let i = 0; i < boxes().length; i++) {
    const b = boxes()[i];
    if (b && !b.checked) { b.click(); await step(() => {}, 30); }
  }
  await step(() => {}, 200);
  check('Before checklist completes to READY', /🟢/.test(text()) && /READY/.test(text()));

  // 14. START PROCEDURE
  await step(() => click(btnByText(/Start Procedure/)));
  check('Procedure starts', /PROCEDURE IN PROGRESS/i.test(text()));

  // 15. COMPLETE PROCEDURE
  await step(() => click(btnByText(/Complete Procedure/)));
  check('Procedure completes and moves to After', /NOT CLOSED|Still needed|record these things/i.test(text()));

  // 16. AFTER checklist -> close case
  const afterBoxes = () => Array.from(doc().querySelectorAll('.kubi-checklist input[type=checkbox]'));
  for (let i = 0; i < afterBoxes().length; i++) {
    const b = afterBoxes()[i];
    if (b && !b.checked) { b.click(); await step(() => {}, 30); }
  }
  await step(() => {}, 200);
  const closeBtn = btnByText(/Close Case/);
  check('Close Case enabled once documented', !!closeBtn && !closeBtn.disabled);
  await step(() => click(closeBtn));
  check('Case closed', /CASE CLOSED/i.test(text()));

  // 17. MANAGEMENT — owner view
  await step(() => click(navByText(/Management/)));
  check('Owner view renders', /Attention|Readiness/i.test(text()));
  const mgmtTabs = Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).map(b => b.textContent.trim());
  check('Management has Overview/MIS/People', mgmtTabs.length === 3, mgmtTabs.join(', '));

  // People stacks attendance and the staff register on one tab, so a
  // staff record stays two levels deep rather than three.
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => b.textContent.trim() === 'People')));
  check('People shows attendance and staff together',
        /Attendance/i.test(text()) && /Staff|Employee/i.test(text()));

  // 18. MIS — a tab inside Management, not an area of its own
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => b.textContent.trim() === 'MIS')));
  check('MIS opens inside Management', /Trend|KPI/i.test(text()));
  const periods = Array.from(doc().querySelectorAll('.period-btn'));
  check('Period selector present', periods.length === 4, periods.map(p => p.textContent).join(' | '));
  check('Historical periods locked without history',
        periods.filter(p => p.disabled).length === 3,
        periods.filter(p => p.disabled).length + ' disabled');
  check('Trend shows no-history state', /Trends appear once|—/.test(text()));

  // 19. MIS sections
  for (const s of ['Patients', 'Treatment', 'Clinic', 'People', 'Exceptions']) {
    await step(() => click(Array.from(doc().querySelectorAll('.mis-tabs .toggle-btn')).find(b => b.textContent.trim() === s)), 140);
    check('MIS ' + s + ' section renders', text().length > 200);
  }

  // 20. ROLE ACCESS — front desk must not see Management or MIS
  const openBeforeHandover = /Clinic Open/i.test(doc().body.textContent);
  await step(() => click(btnByText(/Sign out/)));
  await step(() => login('1115'));

  // A clinic shares one terminal, so signing out is a HANDOVER, not the end
  // of the day. The state used to live inside the signed-in shell, so a
  // shift change reset the clinic to closed with the morning's work erased.
  check('The day survives a shift change',
        openBeforeHandover && /Clinic Open/i.test(doc().body.textContent),
        'open before: ' + openBeforeHandover + ', after: ' + /Clinic Open/i.test(doc().body.textContent));
  const fdNavs = Array.from(doc().querySelectorAll('.nav-item')).map(n => n.textContent);
  check('Front Desk cannot see Management', !fdNavs.some(n => /Management/.test(n)), fdNavs.join(' | '));
  check('Front Desk cannot see MIS', !fdNavs.some(n => /MIS/.test(n)));

  // 20b. Closing is done by whoever is closing up, not only by the role that
  //      owns the section. Front Desk does not own fumigation, and the Closing
  //      tab has no My Checklist / Full Procedure toggle — so if that tab were
  //      filtered by ownership, the protocol would be invisible with no way
  //      back. Every check above this point runs as owner/admin, who owns no
  //      section and so never sees that filter.
  await step(() => click(navByText(/Clinic$/)));
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => /Closing/.test(b.textContent))));
  await step(() => {}, 200);
  const fdFumigation = (text().match(/Fumigation Protocol/g) || []).length;
  check('Fumigation is visible to a role that does not own it', fdFumigation === 1, fdFumigation + ' copies');
  check('...and is tickable there', doc().querySelectorAll('.card input[type=checkbox]').length > 0,
        doc().querySelectorAll('.card input[type=checkbox]').length + ' checkboxes');

  // 20c. The NOW card describes the whole clinic, so it often names somebody
  //      else's job. For a role that cannot open the area it lives in, it
  //      must be information rather than a dead button into a screen their
  //      own sidebar says does not exist.
  await step(() => click(navByText(/Today/)));
  await step(() => {}, 250);
  // Push the engine to name something in Treatment, which Front Desk cannot
  // open — otherwise the read-only path is never exercised. Clearing the
  // seeded equipment fault (Clinic, which they CAN open) hands the answer
  // to the patient in the chair.
  await step(() => click(navByText(/Clinic$/)));
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => /Equipment/.test(b.textContent))));
  for (let r = 0; r < 4; r++) {
    await step(() => click(doc().querySelectorAll('.room-tab')[r]), 120);
    let guard = 0;
    while (doc().querySelector('.equip-row-issue') && guard++ < 6) {
      await step(() => click(doc().querySelector('.equip-row-issue .equip-head')), 100);
      await step(() => click(doc().querySelector('.equip-detail .equip-actions button')), 100);
    }
  }
  await step(() => click(navByText(/Today/)));
  await step(() => {}, 300);

  const fdCard = doc().querySelector('.now-card');
  const readOnly = fdCard && /now-card-readonly/.test(fdCard.className);
  // Whichever way it renders, the two must agree: a card offering a NEXT
  // step must be pressable, and one that is not pressable must not offer a
  // step the person cannot take. It always names the owner either way.
  check('NOW card offers a next step only when it is pressable',
        !fdCard || (readOnly ? (fdCard.tagName !== 'BUTTON' && !fdCard.querySelector('.now-cta'))
                             : (fdCard.tagName === 'BUTTON' && !!fdCard.querySelector('.now-cta'))),
        fdCard ? fdCard.tagName + (readOnly ? ' read-only' : ' actionable') : 'no card');
  check('NOW card names the owner either way', !fdCard || !!fdCard.querySelector('.now-owner'));
  // A read-only card must not navigate anywhere when pressed.
  if (readOnly) {
    const areaBefore = (doc().querySelector('.nav-item-active') || {}).textContent;
    await step(() => click(fdCard));
    await step(() => {}, 200);
    check('Pressing a read-only NOW card goes nowhere',
          ((doc().querySelector('.nav-item-active') || {}).textContent) === areaBefore,
          String(areaBefore).trim());
  }
  check('Front Desk cannot reach Treatment', w.KuBi.canReach('front_desk_receptionist', 'treatment') === false);
  check('House Keeping cannot reach Patients', w.KuBi.canReach('house_keeping', 'patients') === false);
  check('Every role can reach Today', w.KuBi.ROLES.every(r => w.KuBi.canReach(r.id, 'today')));

  // 21. HINDI TOGGLE
  await step(() => click(Array.from(doc().querySelectorAll('.lang-btn')).find(b => /हिं/.test(b.textContent))));
  check('Hindi renders', /मरीज़|क्लिनिक|आज/.test(text()));

  // 22. PRIORITY ENGINE — the readiness rule, checked directly rather than
  //     through the UI, because the journey above deliberately seeds a
  //     patient in the chair and an equipment fault, both of which
  //     outrank readiness by design.
  const K = w.KuBi;
  const openClinic = { open: true, by: 'Test', at: new Date() };

  const everyTask = K.allReadinessTasks();
  const openingOnly = K.openingReadinessStats({});
  check('Opening readiness excludes closing tasks',
        openingOnly.total > 0 && openingOnly.total < everyTask.length,
        openingOnly.total + ' of ' + everyTask.length);

  const quietMorning = K.nextAction({ clinicStatus: openClinic, appointments: [], readinessChecked: {} });
  check('Unfinished readiness is the next action', quietMorning.kind === 'readinessIncomplete', quietMorning.kind);
  check('Readiness action points at Clinic readiness',
        quietMorning.area === 'clinic' && quietMorning.subtab === 'readiness',
        quietMorning.area + '/' + quietMorning.subtab);
  check('Readiness action names an owner and a section',
        !!quietMorning.owner && !!(quietMorning.section && quietMorning.section.title));

  const allDone = {};
  K.CLINIC_READINESS.forEach(sec => {
    if (K.CLINIC_SUBTAB_OF[sec.id] === 'closing') return;
    (sec.perRoom ? K.CLINIC_ROOMS : [null]).forEach(room => {
      sec.groups.forEach((g, gi) => g.tasks.forEach((t, ti) => { allDone[K.taskKey(sec, gi, ti, room)] = true; }));
    });
  });
  const finished = K.nextAction({ clinicStatus: openClinic, appointments: [], readinessChecked: allDone });
  check('Completed readiness stops being raised', finished.kind !== 'readinessIncomplete', finished.kind);

  const inChair = K.nextAction({
    clinicStatus: openClinic, readinessChecked: {},
    appointments: [{ id: 't1', patient: 'Test', chair: 1, status: 'in_chair', procedureType: 'RCT' }],
  });
  check('Patient in the chair outranks readiness', inChair.kind !== 'readinessIncomplete', inChair.kind);

  const broken = K.nextAction({
    clinicStatus: openClinic, appointments: [], readinessChecked: {},
    equipmentStatus: { autoclave: { ok: false, note: 'test' } },
  });
  check('Equipment fault outranks readiness', broken.kind === 'equipmentDown', broken.kind);

  const endOfDay = K.nextAction({
    clinicStatus: openClinic, readinessChecked: {},
    appointments: [{ id: 't2', patient: 'Test', chair: 1, status: 'done', procedureType: 'RCT' }],
  });
  check('Unfinished readiness does not block closing', endOfDay.kind === 'readyToClose', endOfDay.kind);

  // 23. HISTORY STORE — the Google Sheets mirror, exercised against a
  //     stubbed fetch so the suite never touches the network or a real
  //     sheet. What matters is that the clinic still works when the sheet
  //     is absent or unreachable, and that nothing is silently dropped.
  const store = K.historyStore;
  const realConfig = w.KuBi.SHEETS_CONFIG;
  const yesterday = K.operatingDate(new Date(Date.now() - 86400000));
  const snapFor = (date, booked) => ({ date: date, closedProperly: true, booked: booked, arrived: booked, completed: booked, noShow: 0, treatmentsFinished: booked, casesClosed: booked, readinessPct: 100, avgWait: 5, maxWait: 9, staffPresent: 4, staffTotal: 5, exceptions: 0, docPending: 0 });

  // No sheet configured — the original in-memory behaviour, untouched.
  store.reset();
  w.KuBi.SHEETS_CONFIG = { url: '', token: '' };
  store.put(snapFor(yesterday, 7));
  check('Works with no sheet configured',
        store.state().configured === false && store.get(yesterday) !== null && store.state().pending === 0);

  // A reachable sheet hydrates into memory and wakes any listener.
  store.reset();
  w.KuBi.SHEETS_CONFIG = { url: 'https://example.invalid/exec', token: 'tok' };
  let woke = 0;
  const stopListening = store.subscribe(() => { woke++; });
  let lastRequest = null;
  w.fetch = (url, init) => {
    lastRequest = { url: url, init: init };
    if (/action=historyAll/.test(url)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok', rows: [snapFor(yesterday, 11)] }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
  };
  await store.hydrate();
  check('Sheet history hydrates into memory', K.historyDepth() === 1, K.historyDepth() + ' day(s)');
  check('Hydrating notifies the screen', woke > 0, woke + ' notification(s)');
  check('Hydrated history unlocks a period', K.periodAvailable('yesterday') === true);
  check('Hydrated history feeds aggregates', (K.aggregatePeriod('yesterday') || {}).booked === 11);

  // A write goes to memory immediately and to the sheet without a preflight.
  await store.put(snapFor(yesterday, 12));
  check('Write reaches the sheet', store.state().pending === 0 && /action=historyPut/.test(lastRequest.url), 'pending ' + store.state().pending);
  check('Write avoids a CORS preflight',
        lastRequest.init.method === 'POST' && /text\/plain/.test(lastRequest.init.headers['Content-Type']),
        lastRequest.init.headers['Content-Type']);

  // Unreachable sheet: memory still updates, and the write is held.
  w.fetch = () => Promise.reject(new Error('offline'));
  await store.put(snapFor(yesterday, 13));
  check('Offline write still updates the app', (store.get(yesterday) || {}).booked === 13);
  check('Offline write is queued, not lost', store.state().pending === 1, 'pending ' + store.state().pending);

  // Back online: the held write goes through.
  w.fetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
  await store.flush();
  check('Queued write is sent once reachable', store.state().pending === 0, 'pending ' + store.state().pending);

  // An unreachable sheet must never look like an empty one.
  store.reset();
  w.fetch = () => Promise.reject(new Error('offline'));
  const hydratedOffline = await store.hydrate();
  check('Unreachable sheet is not mistaken for empty history',
        hydratedOffline === false && store.state().hydrated === false && K.historyDepth() === 0);

  // Local writes outrank whatever the sheet holds for the same day.
  store.reset();
  store.put(snapFor(yesterday, 99));
  w.fetch = (url) => /action=historyAll/.test(url)
    ? Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok', rows: [snapFor(yesterday, 1)] }) })
    : Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
  await store.hydrate();
  check('Local writes win over the sheet', (store.get(yesterday) || {}).booked === 99, 'booked ' + (store.get(yesterday) || {}).booked);

  stopListening();
  store.reset();
  w.KuBi.SHEETS_CONFIG = realConfig;
  delete w.fetch;

  // 24. HOW THE SCREEN SPEAKS — colour, one blocker, and the cap.
  // A never-ticked requirement blocks exactly as hard as a failed one.
  const proc = K.PROCEDURES ? Object.keys(K.PROCEDURES)[0] : null;
  const untouched = K.treatmentReadyStats('RCT', {});
  check('Never-ticked counts as not done', untouched.ready === false && untouched.missing.length > 0,
        untouched.missing.length + ' outstanding');
  const partial = K.treatmentReadyStats('RCT', { 0: true });
  check('Ticking one does not unlock the rest', partial.ready === false);
  const gateEmpty = K.closureGate('RCT', {});
  check('Closure gate blocks on unanswered', gateEmpty.canClose === false);

  // Attention is capped for display but the true count is preserved.
  const manyAppts = [];
  for (let i = 0; i < 9; i++) {
    manyAppts.push({ id: 'x' + i, patient: 'Patient ' + i, chair: 1, status: 'no_show',
                     procedureType: 'RCT', time: '09:00' });
  }
  const manyItems = K.computeAttentionItems(manyAppts, {}, {}, openClinic, {}, {}, {});
  check('Attention list is not capped at source', manyItems.length > 5, manyItems.length + ' items');

  // 25. REPAIRS — a fresh fault is being dealt with; an old one is not.
  const freshFault = [{ id: 'RF', kind: 'plumbing', place: 'washroom', what: 'Tap', by: 'X', at: new Date(), done: false }];
  const oldFault = [{ id: 'RO', kind: 'plumbing', place: 'washroom', what: 'Tap', by: 'X', at: new Date(Date.now() - 3 * 86400000), done: false }];
  const fixedFault = [{ id: 'RD', kind: 'plumbing', place: 'washroom', what: 'Tap', by: 'X', at: new Date(Date.now() - 9 * 86400000), done: true }];
  const attnFor = reps => K.computeAttentionItems([], {}, {}, openClinic, {}, {}, {}, reps)
                            .filter(i => i.kind === 'repairOpen');
  check('A fault reported today is not chased yet', attnFor(freshFault).length === 0);
  check('A fault open for days needs attention', attnFor(oldFault).length === 1);
  check('A fixed fault is never chased', attnFor(fixedFault).length === 0);
  check('Repair attention names an owner', (attnFor(oldFault)[0] || {}).owner === 'clinic_manager');

  // 26. LAB — late is derived from the promised date, and one truth
  //     serves both the lab screen and the supply check.
  const labLate = c => K.labIsLate(c);
  const cases = K.labCases({});
  check('Lab cases carry a promised date', cases.every(c => !!c.due), cases.length + ' cases');
  check('A late case is one still awaited past its date',
        cases.filter(labLate).every(c => !c.received && c.due < K.operatingDate()));
  const lateIds = cases.filter(labLate).map(c => c.apptId);
  check('Late cases reach the attention list',
        K.computeAttentionItems([], {}, {}, openClinic, {}, {}, {}, [], {})
         .filter(i => i.kind === 'labLate').length === lateIds.length,
        lateIds.join(', ') || 'none');
  if (lateIds.length) {
    const cleared = { };
    cleared[lateIds[0]] = true;
    check('Marking received stops it being late',
          !K.labCases(cleared).find(c => c.apptId === lateIds[0] && labLate(c)));
    check('Supply check agrees with the lab screen',
          K.procedureSupplyStatus('Crown', lateIds[0], cleared).labMissing === false);
  }

  // 27. LAPSED — derived from the last visit, never stored.
  const lapsed = K.lapsedPatients();
  check('Lapsed is derived from the last visit',
        lapsed.every(r => K.daysSinceVisit(r) >= K.LAPSED_AFTER_DAYS), lapsed.length + ' listed');
  check('Longest silence comes first',
        lapsed.every((r, i) => i === 0 || K.daysSinceVisit(lapsed[i - 1]) >= K.daysSinceVisit(r)));
  check('A patient seen this month is not lapsed',
        !K.isLapsed({ patient: 'X', lastVisit: K.operatingDate(new Date(Date.now() - 5 * 86400000)), started: true }));

  // SUMMARY
  await step(() => {}, 150);
  const failed = results.filter(r => !r.pass);
  console.log('\n================================');
  console.log('TOTAL: ' + results.length + '   PASSED: ' + (results.length - failed.length) + '   FAILED: ' + failed.length);
  console.log('RUNTIME ERRORS: ' + (errors.length || 'none'));
  if (errors.length) errors.slice(0, 5).forEach(e => console.log('  ' + e));
  if (failed.length) { console.log('\nFAILURES:'); failed.forEach(f => console.log('  - ' + f.label + (f.detail ? ' [' + f.detail + ']' : ''))); }
})();
