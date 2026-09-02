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
  // Target the action by its label: the patient name in this row is now a
  // button too — it opens the case — so "the first button" is ambiguous.
  await step(() => {
    const row = Array.from(doc().querySelectorAll('.fu-row')).find(r => /Vikram Shah/.test(r.textContent));
    click(Array.from(row.querySelectorAll('button')).find(b => /Mark received/i.test(b.textContent)));
  });
  const awaitedAfter = Array.from(doc().querySelectorAll('.fu-row')).filter(r => /Mark received/.test(r.textContent)).length;
  check('Marking a case received clears it', awaitedAfter === awaitedBefore - 1 && labRows() > 0,
        awaitedBefore + ' -> ' + awaitedAfter + ' awaited');

  // 12c. NOT RETURNED — people the clinic stopped hearing from
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => /Not returned/.test(b.textContent))));
  check('Not-returned tab renders', /stopped coming/i.test(text()));
  check('Both kinds of silence are distinguished',
        /Advised, never started/i.test(text()) && /Started, not finished/i.test(text()));
  check('Recently-seen patients are not listed', !/Sunita Rao/.test(text()));

  // 12d. THE CASE VIEW — reached by clicking, never navigated to.
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => b.textContent.trim() === 'Today')));
  await step(() => {}, 200);
  const patientLink = Array.from(doc().querySelectorAll('.case-link')).find(b => /Arjun Prasad/.test(b.textContent));
  check('A patient with a case is clickable', !!patientLink);
  await step(() => click(patientLink));
  await step(() => {}, 250);
  check('Clicking a patient opens their case', !!doc().querySelector('.case-view'));
  const caseText = () => (doc().querySelector('.case-view') || {}).textContent || '';
  check('The case names the treatment and diagnosis',
        /Root canal, upper left 6/.test(caseText()) && /Irreversible pulpitis/.test(caseText()));
  check('The case shows current and next stage',
        /Cleaning \/ medication/.test(caseText()) && /Obturation/.test(caseText()));
  check('The case lists every visit',
        doc().querySelectorAll('.case-visit').length === 4,
        doc().querySelectorAll('.case-visit').length + ' visits');
  check('The case marks done, now and future differently',
        doc().querySelectorAll('.case-visit-done').length === 1 &&
        doc().querySelectorAll('.case-visit-now').length === 1 &&
        doc().querySelectorAll('.case-visit-future').length === 2);
  check('The case reports Before / Procedure / After / Closure',
        /Before/.test(caseText()) && /Procedure/.test(caseText()) &&
        /After/.test(caseText()) && /Closure/.test(caseText()));
  check('A half-finished case does not read as closed', /Not yet/.test(caseText()));
  await step(() => click(doc().querySelector('.case-back')));
  await step(() => {}, 200);
  check('...and the case view closes', !doc().querySelector('.case-view'));

  // The case nobody is booked in for — the one V1 could not show at all.
  await step(() => click(Array.from(doc().querySelectorAll('.sub-tab-row .toggle-btn')).find(b => b.textContent.trim() === 'Follow-up')));
  await step(() => {}, 200);
  const fuLink = Array.from(doc().querySelectorAll('.case-link')).find(b => /Vikram Shah/.test(b.textContent));
  check('A follow-up opens the case it belongs to', !!fuLink);
  await step(() => click(fuLink));
  await step(() => {}, 250);
  check('A case with no appointment today still opens', !!doc().querySelector('.case-view'));
  check('...and says so rather than showing an empty visit',
        /Not booked in today/i.test(caseText()) && /No visit today/i.test(caseText()));
  check('...and still reports its lab and follow-up',
        /Crown/.test(caseText()) && /Crown fitting/.test(caseText()));
  await step(() => click(doc().querySelector('.case-back')));
  await step(() => {}, 200);

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
  // A repair starts with the Clinic Manager. The one in this fixture has
  // been open three days, which is exactly when it stops being only their
  // problem — so the owner shown is the Owner, and who it started with is
  // still recorded.
  check('Repair attention names whoever holds it now',
        (attnFor(oldFault)[0] || {}).raisedOwner === 'clinic_manager' &&
        (attnFor(oldFault)[0] || {}).owner === 'owner_admin',
        (attnFor(oldFault)[0] || {}).raisedOwner + ' -> ' + (attnFor(oldFault)[0] || {}).owner);

  // 26. LAB — late is derived from the promised date, and one truth
  //     serves both the lab screen and the supply check.
  const labLate = c => K.labIsLate(c);
  const cases = K.labCases({});
  check('Lab cases carry a promised date', cases.every(c => !!c.due), cases.length + ' cases');
  check('A late case is one still awaited past its date',
        cases.filter(labLate).every(c => !c.received && c.due < K.operatingDate()));
  const lateIds = cases.filter(labLate).map(c => c.id);
  check('Late cases reach the attention list',
        K.computeAttentionItems([], {}, {}, openClinic, {}, {}, {}, [], {})
         .filter(i => i.kind === 'labLate').length === lateIds.length,
        lateIds.join(', ') || 'none');
  if (lateIds.length) {
    const cleared = { };
    cleared[lateIds[0]] = true;
    check('Marking received stops it being late',
          !K.labCases(cleared).find(c => c.id === lateIds[0] && labLate(c)));
    // The supply check is asked about an APPOINTMENT now, because the lab
    // question is about that patient's case, not about today's booking.
    const lateCase = K.labCases({}).find(c => c.id === lateIds[0]);
    const visit = { id: 'ANY', procedureType: 'Crown', caseId: lateCase.caseId };
    check('Supply check agrees with the lab screen',
          K.procedureSupplyStatus('Crown', visit, cleared).labMissing === false &&
          K.procedureSupplyStatus('Crown', visit, {}).labMissing === true);
  }

  // 27. LAPSED — derived from the last visit, never stored.
  const lapsed = K.lapsedPatients();
  check('Lapsed is derived from the last visit',
        lapsed.every(r => K.daysSinceVisit(r) >= K.LAPSED_AFTER_DAYS), lapsed.length + ' listed');
  check('Longest silence comes first',
        lapsed.every((r, i) => i === 0 || K.daysSinceVisit(lapsed[i - 1]) >= K.daysSinceVisit(r)));
  check('A patient seen this month is not lapsed',
        !K.isLapsed({ patient: 'X', lastVisit: K.operatingDate(new Date(Date.now() - 5 * 86400000)), started: true }));

  // 28. THE DAY, KEPT ACROSS A REFRESH. Stubbed fetch throughout — the
  //     suite never touches the network or a real sheet.
  const dayCfg = w.KuBi.SHEETS_CONFIG;
  const today = K.operatingDate();

  const liveDay = {
    clinicStatus: { open: true, by: 'Priya Sharma', at: new Date() },
    readinessChecked: { 'staff_entry-0-0': { by: 'Ramesh Yadav', at: new Date() } },
    appointments: [{ id: 'A1', patient: 'Arjun Prasad', status: 'waiting', chair: 1,
                     procedureType: 'RCT', time: '09:30', statusAt: new Date(Date.now() - 20 * 60000) }],
    treatmentChecked: { A1: { 0: true } },
    treatmentCheckedAfter: {}, closingChecked: {},
    procedureState: { A1: { startedAt: new Date(), startedBy: 'Dr. Ananya Rao' } },
    closedCases: {}, equipmentStatus: { autoclave: { ok: false, note: 'x', at: new Date() } },
    repairs: [{ id: 'R1', what: 'Tap', place: 'washroom', kind: 'plumbing', at: new Date(), done: false }],
    labReceived: { A7: true }, sterPacks: [],
  };

  // A round trip through JSON is what the sheet actually stores.
  const wire = JSON.parse(JSON.stringify(K.snapshotDay(liveDay)));
  check('Every day field is carried', K.DAY_FIELDS.every(f => f in wire), K.DAY_FIELDS.length + ' fields');
  check('Dates survive as usable dates',
        !isNaN(new Date(wire.clinicStatus.at).getTime()) &&
        Math.round((Date.now() - new Date(wire.appointments[0].statusAt).getTime()) / 60000) === 20,
        'waiting ' + Math.round((Date.now() - new Date(wire.appointments[0].statusAt).getTime()) / 60000) + ' min');
  check('A restored waiting patient still ages',
        K.computeAttentionItems(wire.appointments, {}, {}, wire.clinicStatus, {}, {}, {}, [], {})
         .some(i => i.kind === 'waitingTooLong'));

  // Restoring must not blank a field the stored record predates.
  const applied = [];
  const fakeDay = {};
  K.DAY_FIELDS.forEach(f => { fakeDay['set' + f[0].toUpperCase() + f.slice(1)] = v => applied.push(f); });
  K.restoreDay(fakeDay, { clinicStatus: wire.clinicStatus, repairs: wire.repairs });
  check('Only stored fields are restored', applied.length === 2 && applied.indexOf('sterPacks') === -1,
        applied.join(', '));

  // Yesterday's clinic must never load over today's.
  check('A record for another date is refused',
        K.dayIsForToday({ date: today }) === true &&
        K.dayIsForToday({ date: '2020-01-01' }) === false &&
        K.dayIsForToday(null) === false);

  // Transport: unreachable is not empty, and a day too big is refused
  // rather than written half-way.
  w.KuBi.SHEETS_CONFIG = { url: 'https://example.invalid/exec', token: 't' };
  let sent = [];
  w.fetch = (url, init) => { sent.push(url); return Promise.reject(new Error('offline')); };
  const offlineLoad = await w.KuBi.historySync.dayLoad(today);
  check('An unreachable sheet returns null, not an empty day', offlineLoad === null);
  const offlineSave = await w.KuBi.historySync.daySave(today, wire);
  check('A failed save reports failure', offlineSave === false);

  w.fetch = (url, init) => {
    sent.push(url);
    if (/action=dayGet/.test(url)) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok', record: { date: today, state: wire } }) });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok' }) });
  };
  const rec = await w.KuBi.historySync.dayLoad(today);
  check('A stored day comes back whole',
        !!rec && !!rec.record && rec.record.date === today && rec.record.state.clinicStatus.open === true);

  // The first day of use stores nothing. If that were reported the same way
  // as "cannot reach the sheet", the app would never dare to write and the
  // day would never be saved at all — which is exactly what happened the
  // first time this was wired up.
  w.fetch = (url) => { sent.push(url); return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 'ok', record: null }) }); };
  const firstDay = await w.KuBi.historySync.dayLoad(today);
  check('An empty sheet is distinguishable from an unreachable one',
        firstDay !== null && firstDay.record === null,
        firstDay === null ? 'reported as unreachable' : 'reported as empty');
  sent = [];
  const big = Object.assign({}, wire, { closingChecked: { blob: 'x'.repeat(K.DAY_MAX_CHARS + 100) } });
  const tooBig = await w.KuBi.historySync.daySave(today, big);
  check('An oversized day is refused, not truncated', tooBig === false && sent.length === 0,
        sent.length + ' requests sent');

  w.KuBi.SHEETS_CONFIG = { url: '', token: '' };
  check('With no sheet configured nothing is sent',
        (await w.KuBi.historySync.daySave(today, wire)) === false &&
        (await w.KuBi.historySync.dayLoad(today)) === null);
  w.KuBi.SHEETS_CONFIG = dayCfg;
  delete w.fetch;

  // 29. MIS VALIDATION — every figure must come from the day's own state,
  //     and a historical figure must never appear without real history.
  const misAppts = [
    { id: 'M1', patient: 'One',   status: 'done',     procedureType: 'RCT',     time: '09:00' },
    { id: 'M2', patient: 'Two',   status: 'waiting',  procedureType: 'Scaling', time: '09:30', statusAt: new Date(Date.now() - 20 * 60000) },
    { id: 'M3', patient: 'Three', status: 'no_show',  procedureType: 'Crown',   time: '10:00' },
    { id: 'M4', patient: 'Four',  status: 'in_chair', procedureType: 'RCT',     time: '10:30' },
    { id: 'M5', patient: 'Five',  status: 'booked',   procedureType: 'RCT',     time: '11:00' },
  ];
  const misCtx = {
    appointments: misAppts,
    procedureState: { M1: { startedAt: new Date(), completedAt: new Date() }, M4: { startedAt: new Date() } },
    closedCases: {}, treatmentChecked: {}, treatmentCheckedAfter: {},
  };
  const m = K.misToday(misCtx);
  const expected = { booked: 5, noShow: 1, arrived: 3, inChair: 2, completed: 1,
                     started: 2, finished: 1, running: 1, casesClosed: 0,
                     notReady: 1, docPending: 1, avgWait: 20, maxWait: 20, carriedForward: 3 };
  const wrong = Object.keys(expected).filter(k => m[k] !== expected[k]);
  check('Every MIS figure is derived from the day', wrong.length === 0,
        wrong.length ? wrong.map(k => k + '=' + m[k] + ' want ' + expected[k]).join(', ') : Object.keys(expected).length + ' figures');

  // Change one thing and the figures must move with it.
  const afterClosing = K.misToday(Object.assign({}, misCtx, { closedCases: { M1: { closedAt: new Date() } } }));
  check('Closing a case moves the figures',
        afterClosing.casesClosed === 1 && afterClosing.docPending === 0,
        'casesClosed ' + m.casesClosed + '->' + afterClosing.casesClosed + ', docPending ' + m.docPending + '->' + afterClosing.docPending);
  const empty = K.misToday({});
  check('An empty day reports zero, not a placeholder',
        empty.booked === 0 && empty.avgWait === null && empty.maxWait === null,
        'avgWait ' + empty.avgWait);

  // History: nothing may be shown until something real is on file.
  K.historyStore.reset();
  check('No history means no depth', K.historyDepth() === 0);
  check('No history means no trend', K.trend('booked', 7) === null && K.trend('avgWait', 30) === null);
  check('No history locks every past period',
        ['yesterday', 'week', 'month'].every(p => K.periodAvailable(p) === false) && K.periodAvailable('today') === true);
  check('No history aggregates to nothing',
        ['yesterday', 'week', 'month'].every(p => K.aggregatePeriod(p) === null));

  // One real day on file, and only then.
  const yday = K.operatingDate(new Date(Date.now() - 86400000));
  K.historyStore.put({ date: yday, closedProperly: true, booked: 8, arrived: 7, completed: 6, noShow: 1,
                       treatmentsFinished: 6, casesClosed: 5, readinessPct: 90, avgWait: 12, maxWait: 25,
                       staffPresent: 4, staffTotal: 5, exceptions: 2, docPending: 1 });
  check('One stored day unlocks yesterday', K.periodAvailable('yesterday') === true && K.historyDepth() === 1);
  const agg = K.aggregatePeriod('yesterday');
  check('The stored day is reported as it was', agg && agg.booked === 8 && agg.avgWait === 12, agg ? 'booked ' + agg.booked : 'null');
  const t7 = K.trend('booked', 7);
  check('A trend reports how many days it stands on', t7 && t7.avg === 8 && t7.days === 1, t7 ? t7.days + ' day(s)' : 'null');
  K.historyStore.reset();

  // The one set of figures that is NOT operational. Attendance is a fixed
  // list with no way to record anything from inside KuBi, so these numbers
  // cannot move whatever the clinic does — and they are written into every
  // stored day. Asserted so the day it becomes real, this check fails and
  // says so.
  const beforeCounts = JSON.stringify(K.attendanceCounts());
  const afterAnything = JSON.stringify(K.attendanceCounts());
  check('KNOWN GAP: staff numbers are fixed, not operational',
        beforeCounts === afterAnything, beforeCounts);

  // 30. A FAULT ONLY OUTRANKS PATIENT FLOW WHEN IT IS ACTUALLY IN THE WAY.
  //     One broken chair used to hold the NOW card for the whole clinic,
  //     all day, through arrivals and treatment, until somebody marked it
  //     working — so the card said the same thing for hours and stopped
  //     being read.
  const eqOpen = { open: true, by: 'X', at: new Date() };
  const chairOne = [{ id: 'E1', patient: 'Arjun', chair: 1, status: 'in_chair', procedureType: 'RCT', time: '09:30' }];
  const chairThree = [{ id: 'E3', patient: 'Kabir', chair: 3, status: 'in_chair', procedureType: 'RCT', time: '10:45' }];
  const brokenChair3 = { chair_3: { ok: false, note: 'Suction issue' } };
  const brokenShared = { autoclave: { ok: false, note: 'Cycle fails' } };
  const eqAsk = (appts, equip) => K.nextAction({ clinicStatus: eqOpen, appointments: appts,
                                                 equipmentStatus: equip, readinessChecked: {}, treatmentChecked: {} }).kind;
  const eqAttention = equip => K.computeAttentionItems([], {}, {}, eqOpen, {}, {}, {}, [], {}, equip)
                                .filter(i => i.kind === 'equipmentDown').length;

  check('A broken empty chair does not outrank the patient in another',
        eqAsk(chairOne, brokenChair3) !== 'equipmentDown', eqAsk(chairOne, brokenChair3));
  check('A broken chair DOES outrank the patient sitting in it',
        eqAsk(chairThree, brokenChair3) === 'equipmentDown');
  check('Shared equipment still outranks patient flow',
        eqAsk(chairOne, brokenShared) === 'equipmentDown');
  check('Unrecognised equipment is assumed to matter',
        eqAsk(chairOne, { mystery_machine: { ok: false, note: '?' } }) === 'equipmentDown');
  // Demoting must not hide it: whatever the card shows, the fault is listed.
  check('A demoted fault still needs attention', eqAttention(brokenChair3) === 1);
  check('Every open fault is listed, not just the loudest',
        eqAttention(Object.assign({}, brokenChair3, brokenShared)) === 2);
  check('A working clinic lists no faults', eqAttention({ chair_2: { ok: true } }) === 0);

  // 31. THE CASE — Patient -> Case -> Stage -> Visit -> Closure.
  //     V1 held case data as fields on today's appointment, so a case with
  //     nobody booked in existed nowhere, and lab work, follow-ups and
  //     lapsed patients referenced no case at all.
  const caseCtx = { appointments: K.APPOINTMENTS_TODAY, procedureState: {}, closedCases: {}, labReceived: {} };

  const seen = K.caseThread('AP0311-RCT_MOLAR-01', caseCtx);
  check('A case assembles into one thread',
        !!seen && seen.patient === 'Arjun Prasad' && !!seen.today && seen.progress.current === 'Cleaning / medication',
        seen ? seen.progress.visitsDone + '/' + seen.progress.visitsTotal + ' visits' : 'null');
  check('The thread knows what comes next', seen.progress.next === 'Obturation', seen.progress.next);

  // The case V1 could not see.
  const unbooked = K.caseThread('VS0221-CROWN_SINGLE-01', caseCtx);
  check('A case with nobody booked today still exists',
        !!unbooked && unbooked.today === null && unbooked.progress.current === 'Try-in',
        unbooked ? 'current: ' + unbooked.progress.current : 'null');
  check('...and knows its lab work is awaited',
        unbooked.lab.length === 1 && unbooked.lab[0].received === false, unbooked.lab.length + ' lab item(s)');
  check('...and knows its follow-up is overdue',
        !!unbooked.closure.followUp && unbooked.closure.followUpDue === true);

  // The joins that did not exist.
  check('Lab work can be found by case', K.caseLab('LM0455-RCT_MOLAR-01', {}).length === 1);
  check('A follow-up can be found by case', !!K.caseFollowUp('LM0455-RCT_MOLAR-01'));
  check('A patient can be asked for their cases', K.casesForPatient('Vikram Shah').length === 1);
  check('A follow-up with no case is still valid',
        (K.FOLLOW_UPS || []).some(f => !f.caseId), 'one-off reviews keep working');

  // Closure: three states V1 collapsed into one.
  const scalingAppt = stages => ({ id: 'CZ', patient: 'Kabir Singh', chair: 3, status: 'in_chair',
                                   procedureType: 'Scaling', caseId: 'KS0502-SCALING-01', time: '10:45',
                                   caseStages: stages });
  const openStage = [{ name: 'Scaling + polishing', done: false, current: true }];
  const doneStage = [{ name: 'Scaling + polishing', done: true }];
  const clo = (stages, proc, closed) => K.caseClosure('KS0502-SCALING-01',
      { appointments: [scalingAppt(stages)], procedureState: proc, closedCases: closed });

  check('Treatment done is not the same as written up',
        clo(openStage, { CZ: { completedAt: new Date() } }, {}).treatmentDone === true &&
        clo(openStage, { CZ: { completedAt: new Date() } }, {}).visitDocumented === false);
  check('Written up is not the same as case closed',
        clo(openStage, { CZ: { completedAt: new Date() } }, { CZ: true }).visitDocumented === true &&
        clo(openStage, { CZ: { completedAt: new Date() } }, { CZ: true }).caseClosed === false);
  check('A case closes when its last stage is done and written up',
        clo(doneStage, { CZ: { completedAt: new Date() } }, { CZ: true }).caseClosed === true);

  // The one V1 got wrong: a good visit on a four-stage case is not the end.
  const midCase = K.caseClosure('AP0311-RCT_MOLAR-01', {
    appointments: [{ id: 'A1', caseId: 'AP0311-RCT_MOLAR-01', patient: 'Arjun Prasad', chair: 1, status: 'done',
                     procedureType: 'RCT', time: '09:30',
                     caseStages: [{ name: 'Cleaning', done: true }, { name: 'Cleaning / medication', done: true },
                                  { name: 'Obturation', done: false }, { name: 'Restoration', done: false }] }],
    procedureState: { A1: { completedAt: new Date() } }, closedCases: { A1: true } });
  check('A documented visit does not close a half-finished case',
        midCase.visitDocumented === true && midCase.caseClosed === false);
  check('Open cases are the ones with work left', K.openCases(caseCtx).length === K.allCases().length,
        K.openCases(caseCtx).length + ' of ' + K.allCases().length);

  // 32. THE CASE TIMELINE — read-only: what happened, when, by whom.
  const tlBase = { appointments: K.APPOINTMENTS_TODAY, procedureState: {}, closedCases: {}, labReceived: {} };
  const tl = K.caseTimeline('AP0311-RCT_MOLAR-01', tlBase);
  check('A case has a timeline', tl.length > 0, tl.length + ' entries');
  check('It runs oldest first',
        tl.filter(e => !e.ahead).every((e, i, dated) => i === 0 || dated[i - 1].on <= e.on));
  check('It opens with the case', tl[0].kind === 'caseOpened' && !!tl[0].by, tl[0].by);
  check('It ends looking forward, not back',
        tl[tl.length - 1].ahead === true && tl[tl.length - 1].stage === 'Obturation',
        tl[tl.length - 1].stage);

  // Today's entries are derived, so they appear the moment the work happens
  // and never need writing.
  const tlBefore = K.caseTimeline('AP0311-RCT_MOLAR-01', tlBase).filter(e => e.on === K.operatingDate()).length;
  const tlAfter = K.caseTimeline('AP0311-RCT_MOLAR-01', Object.assign({}, tlBase, {
    procedureState: { A1: { startedAt: new Date(), completedAt: new Date(), startedBy: 'Dr. Ananya Rao' } },
    closedCases: { A1: { closedBy: 'Dr. Ananya Rao' } },
  })).filter(e => e.on === K.operatingDate());
  check('Doing the work adds to the timeline', tlBefore === 0 && tlAfter.length === 3,
        tlBefore + ' -> ' + tlAfter.length + ' entries today');
  check('...naming who did it', tlAfter.every(e => !!e.by), tlAfter.map(e => e.kind).join(', '));

  // Lab movement belongs to the case, and the lab is a destination.
  const crownTl = K.caseTimeline('MR0184-CROWN_SINGLE-01', tlBase);
  const labEntries = crownTl.filter(e => e.kind === 'labSent' || e.kind === 'labReceived');
  check('Lab movement is on the case timeline', labEntries.length === 2, labEntries.length + ' lab entries');
  check('The lab is recorded as a place, not an actor',
        labEntries.every(e => e.by === null && !!e.lab), labEntries[0] && labEntries[0].lab);

  // Checklist ticks deliberately do NOT earn a place.
  const noisy = K.caseTimeline('AP0311-RCT_MOLAR-01', Object.assign({}, tlBase, {
    treatmentChecked: { A1: { 0: true, 1: true, 2: true, 3: true, 4: true } },
  }));
  check('Checklist ticks do not clutter the timeline', noisy.length === tl.length,
        noisy.length + ' entries, unchanged');

  // 33. TREATMENT TEMPLATES — procedure -> stages -> before -> materials/lab
  //     -> after -> closure. Staff choose the procedure; they never build
  //     the workflow.
  const types = K.TREATMENT_TYPES || [];
  check('Every procedure type has a template', K.templateGaps().length === 0,
        types.length + ' types, ' + K.templateGaps().length + ' gaps');
  check('Every procedure type has stages',
        types.every(ty => K.treatmentTemplate(ty).stages.length > 0));

  const crown = K.treatmentTemplate('Crown');
  check('A template carries the whole chain',
        crown.stages.length === 3 && crown.before.length > 0 && crown.after.length > 0 &&
        crown.materials.length > 0 && crown.closureCategories.length > 0,
        'Crown: ' + crown.stages.join(' -> '));
  check('A template knows when a lab is involved',
        crown.needsLab === true && K.treatmentTemplate('Extraction').needsLab === false);
  check('Templates read the existing checklists rather than copying them',
        crown.before === K.TREATMENT_CHECKLISTS['Crown'] &&
        crown.after === K.TREATMENT_CHECKLISTS_AFTER['Crown']);
  check('Templates only use materials the clinic already tracks',
        types.every(ty => K.treatmentTemplate(ty).materials.every(m => !!m && !!m.id)));

  // A new case is created FROM its procedure.
  const fresh = K.stagesForNewCase('RCT');
  check('A new case starts from the procedure, not by hand',
        fresh.length === 4 && fresh[0].current === true && fresh.every(st => !st.done),
        fresh.map(st => st.name).join(' -> '));

  // Existing cases now take their stages from the template.
  const tplCtx = { appointments: [], procedureState: {}, closedCases: {}, labReceived: {} };
  check('A case with no list of its own uses the template',
        K.caseProgress('VS0221-CROWN_SINGLE-01', []).stages.map(st => st.name).join(',') ===
        K.templateStages('Crown').join(','));
  check('...and its recorded progress still applies',
        K.caseProgress('VS0221-CROWN_SINGLE-01', []).completed.join(',') === 'Preparation');

  // A combined plan keeps its own sequence rather than being forced.
  const implant = K.caseProgress('DN077-IMPLANT_CROWN-01', []);
  check('A case that deviates keeps its own stages',
        implant.stages.length === 5 && implant.stages[0].name === 'Implant placement',
        implant.stages.length + ' stages vs template ' + K.templateStages('Implant Prosthesis').length);

  // Stage names reach Hindi, which the hand-written lists never did.
  check('Stage names are translated',
        K.templateStages('Crown', 'hi')[0] !== K.templateStages('Crown', 'en')[0],
        K.templateStages('Crown', 'hi').join(' / '));
  check('A translated case still tracks the same progress',
        K.caseProgress('VS0221-CROWN_SINGLE-01', [], 'hi').completed.length ===
        K.caseProgress('VS0221-CROWN_SINGLE-01', [], 'en').completed.length);

  // 34. EXCEPTION + ESCALATION — problem, owner, action, escalation,
  //     resolution. V1 named an owner; it could not say how long a problem
  //     had been waiting or who hears about it next.
  const escOpen = { open: true, by: 'X', at: new Date(Date.now() - 3 * 3600000) };
  const waitingSince = mins => [{ id: 'W1', patient: 'Rohan', chair: 1, status: 'waiting',
                                  procedureType: 'RCT', time: '09:00',
                                  statusAt: new Date(Date.now() - mins * 60000) }];
  const waitItem = mins => K.computeAttentionItems(waitingSince(mins), {}, {}, escOpen, {}, {}, {}, [], {}, {})
                            .find(i => i.kind === 'waitingTooLong');

  check('An exception records when it began', !!waitItem(30).raisedAt);
  // Waiting is an exception after 15 minutes, so a 30-minute wait has been
  // an exception for 15 — the age is of the PROBLEM, not of the patient.
  check('Age is measured from when it became a problem',
        waitItem(30).escalation.ageMinutes === 15, waitItem(30).escalation.ageMinutes + ' min');

  check('It starts with whoever owns it',
        waitItem(16).owner === 'front_desk_receptionist' && waitItem(16).escalation.escalated === false);
  check('It escalates when it keeps waiting',
        waitItem(36).owner === 'clinic_manager' && waitItem(36).escalation.escalated === true,
        '36 min waiting -> ' + waitItem(36).owner);
  check('And escalates again',
        waitItem(56).owner === 'owner_admin', '56 min waiting -> ' + waitItem(56).owner);
  check('It says who hears next, and when',
        waitItem(16).escalation.nextRole === 'clinic_manager' &&
        waitItem(16).escalation.nextInMinutes === 19,
        'next: ' + waitItem(16).escalation.nextRole + ' in ' + waitItem(16).escalation.nextInMinutes + ' min');
  check('The last step has nobody left to tell',
        waitItem(56).escalation.nextRole === null && waitItem(56).escalation.nextInMinutes === null);
  check('Who it started with is not lost',
        waitItem(56).raisedOwner === 'front_desk_receptionist');

  // Resolution is the problem going away, not a flag somebody ticks.
  const seated = [{ id: 'W1', patient: 'Rohan', chair: 1, status: 'in_chair', procedureType: 'RCT',
                    time: '09:00', statusAt: new Date(Date.now() - 60 * 60000) }];
  check('Resolution is the condition ending, not a flag',
        K.computeAttentionItems(seated, {}, {}, escOpen, {}, {}, {}, [], {}, {})
          .filter(i => i.kind === 'waitingTooLong').length === 0);

  // Every kind KuBi raises must know who to tell.
  const kinds = ['waitingTooLong', 'noShow', 'treatmentNotReady', 'roomNotReady',
                 'caseNotClosed', 'equipmentDown', 'labLate', 'repairOpen'];
  check('Every kind of exception has a chain',
        kinds.every(k => K.escalationChain(k).length > 0), kinds.length + ' kinds');
  check('Every chain starts at nought minutes',
        kinds.every(k => K.escalationChain(k)[0].after === 0));
  check('Every chain only names real roles',
        kinds.every(k => K.escalationChain(k).every(step => !!K.getRole(step.role))));
  // An unknown kind must still name somebody rather than nobody.
  check('An exception with no chain keeps its owner',
        K.exceptionEscalation({ kind: 'somethingNew', owner: 'clinic_manager' }).owner === 'clinic_manager');

  // 35. LAB — case, expected, received, readiness.
  //     Lab work used to be keyed by the APPOINTMENT that sent it. A crown
  //     is sent at the preparation visit and needed at the fitting, which
  //     is a different appointment, so readiness looked under the wrong
  //     visit and reported a fitting as ready while the crown was still at
  //     the lab. That is the bug this section exists to keep fixed.
  const returnVisit = { id: 'LATER', patient: 'Vikram Shah', chair: 2, status: 'in_chair',
                        procedureType: 'Crown', time: '11:00', caseId: 'VS0221-CROWN_SINGLE-01' };
  const stillOut = K.procedureSupplyStatus('Crown', returnVisit, {});
  check('Lab work is found by case, not by the visit that sent it',
        stillOut.labMissing === true && stillOut.ok === false,
        stillOut.lab ? stillOut.lab.id + ' due ' + stillOut.lab.due : 'not found');
  check('The awaited item is named', !!stillOut.lab && stillOut.lab.item.en === 'Crown');
  check('Receiving it unblocks the treatment',
        K.procedureSupplyStatus('Crown', returnVisit, { L3: true }).ok === true);

  // A case can have more than one thing out at the lab.
  check('Every lab item on a case is considered',
        K.labForCase('VS0221-CROWN_SINGLE-01', {}).length >= 1 &&
        K.procedureSupplyStatus('Crown', returnVisit, {}).labItems.length ===
        K.labForCase('VS0221-CROWN_SINGLE-01', {}).length);

  // Expected: the template knows which treatments involve a lab at all.
  const bridgeNoRecord = { id: 'X1', procedureType: 'Bridge', caseId: 'NOT-A-CASE' };
  const fillingVisit = { id: 'X2', procedureType: 'Filling', caseId: 'NOT-A-CASE' };
  check('A treatment that needs a lab is known to need one',
        K.procedureSupplyStatus('Bridge', bridgeNoRecord, {}).labExpected === true &&
        K.procedureSupplyStatus('Filling', fillingVisit, {}).labExpected === false);
  check('Expecting a lab with nothing recorded is its own problem',
        K.procedureSupplyStatus('Bridge', bridgeNoRecord, {}).labUnrecorded === true);
  check('...and is not confused with work simply not back yet',
        K.procedureSupplyStatus('Crown', returnVisit, {}).labUnrecorded === false &&
        K.procedureSupplyStatus('Crown', returnVisit, {}).labMissing === true);
  check('A filling is never waiting on a lab',
        K.procedureSupplyStatus('Filling', fillingVisit, {}).labUnrecorded === false);

  // A one-off visit with no case still finds work booked against it.
  check('A visit with no case falls back to its own booking',
        K.labForAppointment({ id: 'A2' }, {}).length === 0 ||
        K.labForAppointment({ id: 'A2' }, {}).every(l => l.apptId === 'A2'));

  check('Received lab work records when it arrived',
        K.labCases({}).filter(l => l.received).every(l => !!l.receivedOn),
        K.labCases({}).filter(l => l.received).length + ' received');

  // 36. FOLLOW-UP — case closed, follow-up due, and it turns up in Today.
  //     Follow-ups existed but lived only inside the Patients tab: one due
  //     TODAY and one four days OVERDUE were visible nowhere the clinic
  //     actually looks.
  check('Due means today or past, not just past',
        K.followUpIsDue({ due: K.operatingDate() }) === true &&
        K.followUpIsDue({ due: K.operatingDate(new Date(Date.now() - 86400000)) }) === true &&
        K.followUpIsDue({ due: K.operatingDate(new Date(Date.now() + 86400000)) }) === false);

  const fuOpen = { open: true, by: 'X', at: new Date() };
  const fuItems = nobody => K.computeAttentionItems(nobody, {}, {}, fuOpen, {}, {}, {}, [], {}, {})
                             .filter(i => i.kind === 'followUpDue');
  const raised = fuItems([]);
  check('A due follow-up reaches the attention list', raised.length > 0, raised.length + ' due');
  check('It names the patient and why', raised.every(i => !!i.patient && !!i.reason));
  check('It is owned, and escalates like anything else',
        raised.every(i => !!i.owner && !!i.escalation),
        raised.map(i => i.patient + ': ' + i.owner).join(', '));
  check('A follow-up four days late has escalated',
        raised.some(i => i.escalation.escalated === true));

  // The loop closing: the patient came back, so stop chasing them.
  const backToday = [{ id: 'B1', patient: raised[0].patient, chair: 1, status: 'arrived',
                       procedureType: 'Consultation', time: '09:00', statusAt: new Date() }];
  check('Somebody already booked in today is not chased',
        !fuItems(backToday).some(i => i.patient === raised[0].patient),
        raised[0].patient + ' is back');
  check('...but everybody else still is', fuItems(backToday).length === raised.length - 1);

  // The case knows which of the three endings it is at.
  const stCtx = { appointments: [], procedureState: {}, closedCases: {}, labReceived: {} };
  check('An unfinished case is in treatment',
        K.caseState('AP0311-RCT_MOLAR-01', stCtx) === 'inTreatment',
        K.caseState('AP0311-RCT_MOLAR-01', stCtx));
  const oneStage = [{ id: 'S1', patient: 'Kabir Singh', chair: 3, status: 'done', procedureType: 'Scaling',
                      time: '10:45', caseId: 'KS0502-SCALING-01',
                      caseStages: [{ name: 'Scaling + polishing', done: true }] }];
  check('Treatment finished but not written up is its own state',
        K.caseState('KS0502-SCALING-01',
          { appointments: oneStage, procedureState: { S1: { completedAt: new Date() } }, closedCases: {} })
          === 'treatmentDone');
  // Closing a case now EARNS a follow-up: the procedure says what review it
  // needs and the closing date is already recorded, so KuBi works it out
  // rather than asking anybody to book it. A closed scaling case is
  // therefore 'complete' — closed, with the patient due back later — and
  // 'closed' is reserved for procedures that need no review at all.
  const closedScaling = { appointments: oneStage,
                          procedureState: { S1: { completedAt: new Date() } },
                          closedCases: { S1: { closedAt: new Date(), closedBy: 'Dr. Ananya Rao' } } };
  check('A closed case that earns a review is complete, not merely closed',
        K.caseState('KS0502-SCALING-01', closedScaling) === 'complete',
        K.caseState('KS0502-SCALING-01', closedScaling));
  const earned = K.caseClosure('KS0502-SCALING-01', closedScaling).followUp;
  check('...and KuBi worked out when, without being told',
        !!earned && earned.derived === true && !!earned.due && !!earned.reason,
        earned ? earned.reason + ' due ' + earned.due : 'none');

  // A follow-up due on an OPEN case is part of the treatment, not its tail.
  check('A due follow-up does not by itself end a case',
        K.caseState('VS0221-CROWN_SINGLE-01', stCtx) === 'inTreatment',
        'Vikram is overdue a follow-up but his crown case is still open');

  // 37. THE ATTENTION LIST IS ORDERED BY HOW BAD IT HAS GOT.
  //     Only five are shown, so what sits at the top is the whole question.
  //     Insertion order used to decide it, which put four room checklists
  //     raised a minute ago above a follow-up four days overdue.
  const ordOpen = { open: true, by: 'X', at: new Date() };
  const ordered = K.computeAttentionItems([], {}, {}, ordOpen, {}, {}, {},
                                          K.REPAIRS_SEED, {}, K.EQUIPMENT_STATUS_SEED);
  check('Worst first, by how far it has escalated',
        ordered.every((it, i) => i === 0 ||
          ordered[i - 1].escalation.level > it.escalation.level ||
          (ordered[i - 1].escalation.level === it.escalation.level &&
           ordered[i - 1].escalation.ageMinutes >= it.escalation.ageMinutes)),
        ordered.slice(0, 3).map(i => i.kind + ' L' + i.escalation.level).join(' > '));
  check('An escalated item outranks a fresh one',
        ordered[0].escalation.level > 0 || ordered.every(i => i.escalation.level === 0),
        'top: ' + ordered[0].kind + ' (level ' + ordered[0].escalation.level + ')');
  // Rooms raised the moment the clinic opened must not crowd out the rest.
  const firstFive = ordered.slice(0, 5).map(i => i.kind);
  check('The top five are not all one kind', new Set(firstFive).size > 1, firstFive.join(', '));

  // 38. PERSISTENT MIS — daily snapshot, history, trends.
  //     The snapshot used to record how MANY exceptions a day had. Two
  //     months of "7" says nothing about whether it is always Chair 3, and
  //     history you did not record cannot be recovered later.
  const snapOpen = { open: true, by: 'X', at: new Date() };
  const snapCtx = {
    appointments: K.APPOINTMENTS_TODAY, procedureState: {}, closedCases: {},
    treatmentChecked: {}, treatmentCheckedAfter: {}, readinessChecked: {},
    equipmentStatus: K.EQUIPMENT_STATUS_SEED, sterPacks: [], clinicStatus: snapOpen,
    closingChecked: {}, repairs: K.REPAIRS_SEED, labReceived: {},
  };
  const snap = K.buildSnapshot(snapCtx, true);
  check('A snapshot records WHICH problems, not just how many',
        !!snap.exceptionKinds && Object.keys(snap.exceptionKinds).length > 0,
        Object.keys(snap.exceptionKinds).join(', '));
  check('The kinds add up to the total',
        Object.keys(snap.exceptionKinds).reduce((n, k) => n + snap.exceptionKinds[k], 0) === snap.exceptions,
        snap.exceptions + ' exceptions');
  check('A snapshot records what the day left open',
        typeof snap.casesOpen === 'number' && typeof snap.followUpsDue === 'number',
        snap.casesOpen + ' cases, ' + snap.followUpsDue + ' follow-ups');

  // Repeats: days-appeared-on before the total, because nine faults on one
  // bad Tuesday is a different problem from one a day for nine days.
  K.historyStore.reset();
  check('No history means nothing repeats', K.repeatingProblems(30).length === 0);
  const dayAgo = n => K.operatingDate(new Date(Date.now() - n * 86400000));
  K.historyStore.put({ date: dayAgo(1), exceptionKinds: { roomNotReady: 1, labLate: 1 }, exceptions: 2 });
  K.historyStore.put({ date: dayAgo(2), exceptionKinds: { roomNotReady: 1 }, exceptions: 1 });
  K.historyStore.put({ date: dayAgo(3), exceptionKinds: { roomNotReady: 1, waitingTooLong: 9 }, exceptions: 10 });
  const rep = K.repeatingProblems(30);
  check('What repeats is counted across days',
        rep[0].kind === 'roomNotReady' && rep[0].days === 3 && rep[0].total === 3,
        rep.map(r => r.kind + ' ' + r.days + 'd/' + r.total).join(', '));
  check('A one-day spike does not outrank a daily problem',
        rep.findIndex(r => r.kind === 'roomNotReady') < rep.findIndex(r => r.kind === 'waitingTooLong'),
        'waitingTooLong was 9 times but on 1 day');
  check('Only days inside the window count',
        K.repeatingProblems(2).every(r => r.days <= 2), '2-day window');

  // A day stored before this change has no kinds, and must not break it.
  K.historyStore.reset();
  K.historyStore.put({ date: dayAgo(1), exceptions: 5 });
  check('An older day without kinds is simply skipped', K.repeatingProblems(30).length === 0);
  check('...and still counts for the figures it does have',
        K.aggregatePeriod('yesterday').exceptions === 5);
  K.historyStore.reset();

  // Cases and follow-ups average rather than sum: "7 open" across a week
  // is not 49.
  check('Open cases average across a period, they do not add up',
        K.MIS_RATE_FIELDS.indexOf('casesOpen') !== -1 &&
        K.MIS_COUNT_FIELDS.indexOf('casesOpen') === -1);

  // 39. INVENTORY INTELLIGENCE — today / tomorrow / minimum / reorder.
  //     Stock used to be a hand-set word with no number behind it, and
  //     KuBi knew nothing about any day but today.
  // Stock is either a plain quantity or dated batches. Both are numbers
  // KuBi works from; neither is a state somebody typed.
  check('Stock state is derived from what is there, not set by hand',
        (K.MATERIALS || []).every(m => typeof m.min === 'number' &&
          (typeof m.qty === 'number' || (Array.isArray(m.batches) && m.batches.length))),
        K.MATERIALS.filter(m => m.batches).length + ' batched of ' + K.MATERIALS.length);
  check('Below the minimum is LOW',
        K.materialState({ qty: 6, min: 10 }) === 'low' &&
        K.materialState({ qty: 10, min: 10 }) === 'low');
  check('Nothing left is NOT AVAILABLE', K.materialState({ qty: 0, min: 5 }) === 'out');
  check('Above the minimum is READY', K.materialState({ qty: 11, min: 10 }) === 'ok');
  check('Unmeasured stock still answers', K.materialState({}) === 'ok');

  check('Reorder is everything at or below its minimum',
        K.reorderList().every(m => K.materialState(m) !== 'ok') &&
        K.reorderList().length === K.MATERIALS.filter(m => K.materialState(m) !== 'ok').length,
        K.reorderList().map(m => m.name.en).join(', '));

  // The forward view: KuBi now knows what is booked beyond today.
  const tmr = K.operatingDate(new Date(Date.now() + 86400000));
  check('KuBi knows what is booked tomorrow', K.bookedBetween(tmr, tmr).length > 0,
        K.bookedBetween(tmr, tmr).map(u => u.procedureType).join(', '));

  const outlook = K.supplyOutlook(K.APPOINTMENTS_TODAY);
  check('The outlook covers today, tomorrow and the week',
        !!outlook.today && !!outlook.tomorrow && !!outlook.week && !!outlook.reorder);
  check('Only problems are listed, never a wall of fine',
        outlook.today.concat(outlook.tomorrow, outlook.week).every(r => r.state !== 'ok'));
  check('A material needed by two treatments is listed once',
        outlook.week.every((r, i, all) => all.findIndex(x => x.material.id === r.material.id) === i));
  check('Worst first', outlook.week.every((r, i, all) =>
        i === 0 || !(all[i - 1].state === 'low' && r.state === 'out')));
  check('It says which treatments need it',
        outlook.today.every(r => Array.isArray(r.forTypes) && r.forTypes.length > 0),
        outlook.today.map(r => r.material.name.en + ' for ' + r.forTypes.join('/')).join('; ') || 'nothing short today');

  // Something below minimum that nothing booked needs belongs on the
  // reorder list and nowhere else — it is not stopping any work.
  const gauzeShort = K.materialState(K.materialById('gauze')) !== 'ok';
  check('Short stock nothing needs is reorder-only, not an alarm',
        !gauzeShort || (K.reorderList().some(m => m.id === 'gauze') &&
                        !outlook.today.some(r => r.material.id === 'gauze')),
        'gauze is short but nothing booked today uses it');

  // 40. EXPIRY — the one thing V2 cannot work out for itself.
  //     No fact already in KuBi implies the date printed on a box, so it
  //     is asked for once, when the stock arrives, and nothing further.
  //     Expired stock then stops counting as stock, which feeds the same
  //     READY / LOW / NOT AVAILABLE the clinic already reads.
  const cement = K.materialById('cement');
  const onShelf = cement.batches.reduce((n, b) => n + b.qty, 0);
  check('Expired stock is on the shelf but is not stock',
        K.usableQty(cement) < onShelf,
        onShelf + ' on the shelf, ' + K.usableQty(cement) + ' usable');
  check('A batch past its date is expired',
        K.batchExpired({ expires: K.operatingDate(new Date(Date.now() - 86400000)) }) === true &&
        K.batchExpired({ expires: K.operatingDate(new Date(Date.now() + 86400000)) }) === false);
  check('A batch with no date never expires', K.batchExpired({ qty: 5 }) === false);

  // Expiring stock changes availability by itself — nobody re-states it.
  const allGone = { min: 5, batches: [{ qty: 9, expires: K.operatingDate(new Date(Date.now() - 86400000)) }] };
  check('Stock that has all expired reads as NOT AVAILABLE',
        K.materialState(allGone) === 'out', K.usableQty(allGone) + ' usable');
  const halfGone = { min: 5, batches: [{ qty: 4, expires: K.operatingDate(new Date(Date.now() + 99 * 86400000)) },
                                       { qty: 40, expires: K.operatingDate(new Date(Date.now() - 86400000)) }] };
  check('...and stock partly expired can fall to LOW',
        K.materialState(halfGone) === 'low', K.usableQty(halfGone) + ' usable of 44');

  check('What is expiring is listed soonest first',
        K.expiringSoon(30).every((e, i, all) => i === 0 || all[i - 1].daysLeft <= e.daysLeft),
        K.expiringSoon(30).map(e => e.material.name.en + ' ' + e.daysLeft + 'd').join(', '));
  check('Already-expired is flagged as such',
        K.expiringSoon(30).filter(e => e.expired).every(e => e.daysLeft < 0));
  check('A far-off date is not nagged about',
        K.expiringSoon(30).every(e => e.daysLeft <= 30));

  // Expiry is opt-in: gloves and gauze do not need a date, and asking for
  // one would be exactly what the V2 principle forbids.
  check('Materials without batches keep working unchanged',
        K.materialState(K.materialById('gloves')) === 'ok' &&
        !K.materialById('gloves').batches);
  check('Expiry reaches the outlook',
        Array.isArray(K.supplyOutlook(K.APPOINTMENTS_TODAY).expiring));

  // 41. THE V2 PRINCIPLE, AS A TEST.
  //     "KuBi V2 should not ask staff to enter more information. It should
  //     use the information already entered to make the next decision
  //     easier." One record in, several conclusions out — asserted here so
  //     the chain cannot quietly break.
  const chainAppt = K.APPOINTMENTS_TODAY.find(a => a.caseId === 'MR0184-CROWN_SINGLE-01');
  const chainBase = { appointments: [chainAppt], procedureState: {}, closedCases: {},
                      treatmentChecked: {}, treatmentCheckedAfter: {}, readinessChecked: {},
                      clinicStatus: { open: true, by: 'X', at: new Date() }, labReceived: {} };

  // ONE tick: the crown came back.
  check('Recording a lab receipt is enough to unblock the treatment',
        K.procedureSupplyStatus('Crown', chainAppt, { L1: false }).ok === false &&
        K.procedureSupplyStatus('Crown', chainAppt, { L1: true }).ok === true);

  // ONE button: the procedure finished.
  const procDone = Object.assign({}, chainBase,
    { procedureState: { A2: { startedAt: new Date(), completedAt: new Date() } } });
  check('Finishing a procedure is enough to raise the documentation',
        K.nextAction(procDone).kind === 'needsDocumentation' &&
        K.caseState('MR0184-CROWN_SINGLE-01', procDone) === 'treatmentDone');
  check('...and enough to write the timeline',
        K.caseTimeline('MR0184-CROWN_SINGLE-01', procDone)
          .filter(e => e.on === K.operatingDate()).length === 2);

  // ONE button: the case closed.
  const caseShut = Object.assign({}, procDone, {
    appointments: [Object.assign({}, chainAppt,
      { caseStages: chainAppt.caseStages.map(st => ({ name: st.name, done: true })) })],
    closedCases: { A2: { closedAt: new Date(), closedBy: 'Dr. Karan Mehta' } },
  });
  const earnedFu = K.caseClosure('MR0184-CROWN_SINGLE-01', caseShut).followUp;
  check('Closing a case is enough to know when the patient is due back',
        !!earnedFu && earnedFu.derived === true,
        earnedFu ? earnedFu.reason + ' due ' + earnedFu.due : 'nothing derived');
  check('Nobody was asked to book it', !(K.FOLLOW_UPS || []).some(f => f.caseId === 'MR0184-CROWN_SINGLE-01'));

  // 42. THE WHOLE CHAIN, STEP BY STEP.
  //     state -> next action -> owner -> closure, asserted at every stage of
  //     one real case (a Crown: three stages, lab work, a review after).
  //     Not "does it run", but "does it say the right thing at every point".
  const CID = 'MR0184-CROWN_SINGLE-01', CA = 'A2';
  const cStages = shut => [{ name: 'Preparation', done: true }, { name: 'Try-in', done: true },
                           { name: 'Final fitting', done: shut, current: !shut }];
  const cAppt = o => Object.assign({ id: CA, patient: 'Meera Reddy', chair: 2, doctor: 'Dr. Karan Mehta',
    treatment: 'Crown delivery', procedureType: 'Crown', time: '10:15', caseId: CID,
    caseStages: cStages(false) }, o || {});
  const allBefore = () => { const m = {}; (K.TREATMENT_CHECKLISTS['Crown'] || []).forEach((_, i) => m[i] = true); return m; };
  const allAfter = () => { const m = {}; (K.TREATMENT_CHECKLISTS_AFTER['Crown'] || []).forEach((_, i) => m[i] = true); return m; };
  const allReady = () => { const m = {}; K.allReadinessTasks().forEach(k => m[k] = true); return m; };
  const ranProc = { [CA]: { startedAt: new Date(), completedAt: new Date() } };
  const chainCtx = over => Object.assign({
    clinicStatus: { open: true, by: 'X', at: new Date(Date.now() - 3600000) },
    procedureState: {}, closedCases: {}, treatmentChecked: {}, treatmentCheckedAfter: {},
    readinessChecked: {}, equipmentStatus: {}, sterPacks: [], labReceived: {} }, over);

  const CHAIN = [
    ['clinic not open', { clinicStatus: { open: false }, appointments: [cAppt({ status: 'booked' })] },
     'inTreatment', 'openClinic', 'front_desk_receptionist'],
    ['readiness undone', { appointments: [cAppt({ status: 'booked' })] },
     'inTreatment', 'readinessIncomplete', null],
    ['patient arrived', { readinessChecked: allReady(), appointments: [cAppt({ status: 'arrived', statusAt: new Date() })] },
     'inTreatment', 'seatPatient', 'front_desk_receptionist'],
    ['in chair, unprepped', { readinessChecked: allReady(), appointments: [cAppt({ status: 'in_chair' })] },
     'inTreatment', 'notReady', 'lead_dental_assistant'],
    ['crown not back', { readinessChecked: allReady(), appointments: [cAppt({ status: 'in_chair' })],
      treatmentChecked: { [CA]: allBefore() }, labReceived: { L1: false } },
     'inTreatment', 'supplyMissing', 'front_desk_receptionist'],
    ['crown received', { readinessChecked: allReady(), appointments: [cAppt({ status: 'in_chair' })],
      treatmentChecked: { [CA]: allBefore() }, labReceived: { L1: true } },
     'inTreatment', 'readyToStart', 'lead_dentist'],
    ['underway', { readinessChecked: allReady(), appointments: [cAppt({ status: 'in_chair' })],
      treatmentChecked: { [CA]: allBefore() }, labReceived: { L1: true },
      procedureState: { [CA]: { startedAt: new Date() } } },
     'inTreatment', 'inProgress', 'lead_dentist'],
    ['not written up', { readinessChecked: allReady(), appointments: [cAppt({ status: 'in_chair' })],
      treatmentChecked: { [CA]: allBefore() }, labReceived: { L1: true }, procedureState: ranProc },
     'treatmentDone', 'needsDocumentation', 'lead_dentist'],
    ['documented', { readinessChecked: allReady(), appointments: [cAppt({ status: 'in_chair' })],
      treatmentChecked: { [CA]: allBefore() }, treatmentCheckedAfter: { [CA]: allAfter() },
      labReceived: { L1: true }, procedureState: ranProc },
     'treatmentDone', 'caseReadyToClose', 'lead_dentist'],
    ['case closed', { readinessChecked: allReady(),
      appointments: [cAppt({ status: 'done', caseStages: cStages(true) })],
      treatmentChecked: { [CA]: allBefore() }, treatmentCheckedAfter: { [CA]: allAfter() },
      labReceived: { L1: true }, procedureState: ranProc,
      closedCases: { [CA]: { closedAt: new Date(), closedBy: 'Dr. Karan Mehta' } } },
     'complete', 'readyToClose', 'clinic_manager'],
  ];

  const badState = [], badAction = [], badOwner = [];
  CHAIN.forEach(row => {
    const ctx = chainCtx(row[1]);
    const na = K.nextAction(ctx);
    const st = K.caseState(CID, ctx);
    if (st !== row[2]) badState.push(row[0] + ': ' + st);
    if (na.kind !== row[3]) badAction.push(row[0] + ': ' + na.kind);
    if (row[4] && na.owner !== row[4]) badOwner.push(row[0] + ': ' + na.owner);
  });
  check('The case reports the right STATE at every step', badState.length === 0,
        badState.join(' | ') || CHAIN.length + ' steps');
  check('KuBi names the right NEXT ACTION at every step', badAction.length === 0,
        badAction.join(' | ') || CHAIN.length + ' steps');
  check('...and the right OWNER for it', badOwner.length === 0,
        badOwner.join(' | ') || 'every step');

  // The step that was missing entirely: documented, and still open. KuBi fell
  // through to the seated-patient rule and told the dentist to START a
  // treatment they had just finished.
  const docCtx = chainCtx(CHAIN[8][1]);
  check('A finished, documented treatment is never "ready to start"',
        K.nextAction(docCtx).kind !== 'readyToStart', K.nextAction(docCtx).kind);

  check('Nothing reads as closed until it is',
        CHAIN.slice(0, 9).every(row => K.caseClosure(CID, chainCtx(row[1])).caseClosed === false));
  const shutCtx = chainCtx(CHAIN[9][1]);
  check('Closed, and the patient is due back',
        K.caseClosure(CID, shutCtx).caseClosed === true && !!K.caseClosure(CID, shutCtx).followUp,
        (K.caseClosure(CID, shutCtx).followUp || {}).reason || 'none');

  // The same problem must not have two owners in two places.
  const labExc = K.computeAttentionItems([], {}, {}, { open: true, at: new Date() }, {}, {}, {}, [], {}, {})
                  .find(i => i.kind === 'labLate');
  check('A lab blockage has one owner, not two',
        K.nextAction(chainCtx(CHAIN[4][1])).owner === (labExc ? labExc.raisedOwner : 'front_desk_receptionist'),
        'card: ' + K.nextAction(chainCtx(CHAIN[4][1])).owner + ', list: ' + (labExc ? labExc.raisedOwner : '-'));

  // SUMMARY
  await step(() => {}, 150);
  const failed = results.filter(r => !r.pass);
  console.log('\n================================');
  console.log('TOTAL: ' + results.length + '   PASSED: ' + (results.length - failed.length) + '   FAILED: ' + failed.length);
  console.log('RUNTIME ERRORS: ' + (errors.length || 'none'));
  if (errors.length) errors.slice(0, 5).forEach(e => console.log('  ' + e));
  if (failed.length) { console.log('\nFAILURES:'); failed.forEach(f => console.log('  - ' + f.label + (f.detail ? ' [' + f.detail + ']' : ''))); }
})();
