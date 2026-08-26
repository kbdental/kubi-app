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
  check('Six top-level areas present', navs.length === 6, navs.join(' | '));

  // 3. NOW card says clinic closed
  check('NOW card prompts to open clinic', /isn.t open yet|Open the Clinic/i.test(text()));

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

  // 10. CLOSING — fumigation lives here
  await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => /Closing/.test(b.textContent))));
  check('Closing gate present', /Clinic Cannot Close|Clinic May Close/i.test(text()));
  check('Fumigation under Closing', /Fumigation/i.test(text()));

  // 11. PATIENT JOURNEY
  await step(() => click(navByText(/Patient Journey/)));
  check('Journey strips render', doc().querySelectorAll('.journey-strip').length > 0,
        doc().querySelectorAll('.journey-strip').length + ' strips');
  check('Whole-treatment strip renders', doc().querySelectorAll('.case-strip').length > 0,
        doc().querySelectorAll('.case-strip').length + ' case strips');

  // 12. FOLLOW-UP tab
  await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => /Follow-up/.test(b.textContent))));
  check('Follow-up list renders', /Sanjay|Vikram|due back/i.test(text()));

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
  const mgmtTabs = Array.from(doc().querySelectorAll('.toggle-btn')).map(b => b.textContent.trim());
  check('Management has only Overview/Attendance/Staff', mgmtTabs.length === 3, mgmtTabs.join(', '));

  // 18. MIS — own area
  await step(() => click(navByText(/^MIS/)));
  check('MIS is its own area', /Trend|KPI/i.test(text()));
  const periods = Array.from(doc().querySelectorAll('.period-btn'));
  check('Period selector present', periods.length === 4, periods.map(p => p.textContent).join(' | '));
  check('Historical periods locked without history',
        periods.filter(p => p.disabled).length === 3,
        periods.filter(p => p.disabled).length + ' disabled');
  check('Trend shows no-history state', /Trends appear once|—/.test(text()));

  // 19. MIS sections
  for (const s of ['Patients', 'Treatment', 'Clinic', 'People', 'Exceptions']) {
    await step(() => click(Array.from(doc().querySelectorAll('.toggle-btn')).find(b => b.textContent.trim() === s)), 140);
    check('MIS ' + s + ' section renders', text().length > 200);
  }

  // 20. ROLE ACCESS — front desk must not see Management or MIS
  await step(() => click(btnByText(/Sign out/)));
  await step(() => login('1115'));
  const fdNavs = Array.from(doc().querySelectorAll('.nav-item')).map(n => n.textContent);
  check('Front Desk cannot see Management', !fdNavs.some(n => /Management/.test(n)), fdNavs.join(' | '));
  check('Front Desk cannot see MIS', !fdNavs.some(n => /MIS/.test(n)));

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

  // SUMMARY
  await step(() => {}, 150);
  const failed = results.filter(r => !r.pass);
  console.log('\n================================');
  console.log('TOTAL: ' + results.length + '   PASSED: ' + (results.length - failed.length) + '   FAILED: ' + failed.length);
  console.log('RUNTIME ERRORS: ' + (errors.length || 'none'));
  if (errors.length) errors.slice(0, 5).forEach(e => console.log('  ' + e));
  if (failed.length) { console.log('\nFAILURES:'); failed.forEach(f => console.log('  - ' + f.label + (f.detail ? ' [' + f.detail + ']' : ''))); }
})();
