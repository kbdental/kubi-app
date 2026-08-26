# KuBi — Clinic Operating System

Operational app for K.B. Dental Clinic. Runs the clinic day from opening
through to closing, telling staff what needs doing and why.

## Run it

Open `KuBi.html` in a browser. No server, no install, no internet needed —
React is bundled in.

## Build it

```bash
npm install
npm run build     # compiles src/ -> KuBi.html
npm test          # builds, then runs 61 journey checks + 7 bundle checks
```

`KuBi.html` is generated. Edit `src/`, never the bundle.

## Structure

```
src/
  # data + logic (plain JS, no JSX)
  i18n.js              English/Hindi strings — every user-visible word
  roles.js             9 roles, categories, area access
  mockData.js          Employees, attendance, operatingDate() helper
  clinicReadiness.js   Opening checklist, room mapping
  clinicClosing.js     11-item closing gate (5 critical)
  patientCheckIn.js    Appointments, journey stages, follow-ups
  treatmentChecklists.js  27 procedures, before/after, closure gate
  attention.js         What needs attention, with owner + reason
  equipment.js         Equipment status list
  sterilization.js     Instrument pack chain
  inventory.js         Materials mapped to procedures
  nextAction.js        THE PRIORITY ENGINE — one action from 8 states
  mis.js               Management KPI computation
  sheetsSync.js        Google Sheets transport (the only network code)
  history.js           Daily snapshots + trends (STORAGE ADAPTER HERE)

  # screens (JSX)
  Today.jsx  Clinic.jsx  Patients.jsx  Treatment.jsx
  MIS.jsx  Management.jsx  AttendanceModule.jsx  EmployeeMaster.jsx
  App.jsx              Shell, all shared state, navigation
```

## Five areas

```
TODAY        What needs attention now?
CLINIC       Is the clinic ready and operating correctly?
PATIENTS     Where is every patient in today's journey?
TREATMENT    Where is every treatment/case?
MANAGEMENT   Owner · MIS · People
```

MIS is management information, so it is a tab inside Management, not a
sixth destination beside the clinical day. People stacks attendance and
the staff register on one tab, keeping a staff record two levels deep.

## Two rules that hold the design together

**One priority engine.** `nextAction.js` consumes all eight state inputs
and emits exactly one recommended action. Features must feed this engine
rather than inventing their own "what's next" logic.

**Never expose internals.** Staff see: what to do, is it ready, what's
missing, what's next. Component names, state keys and the four internal
closure categories stay behind the screen. All user-facing text lives in
`i18n.js`.

## Build hazard worth knowing

`build.js` uses **function replacers**, not string replacements, when
injecting code into the HTML. This is deliberate: JavaScript's
`String.replace()` treats `$$`, `` $` ``, `$&` and `$'` as escape
sequences, which silently corrupts React's source (it contains
`$$typeof`) and produces a bundle that fails with
`Invalid or unexpected token` and `ReactDOM is not defined`.

`test-bundle.js` loads the built file and catches exactly this class of
fault — the journey test compiles `src/` directly and cannot see it.
Keep both in `npm test`.

## History and Google Sheets

`history.js` keeps daily snapshots in memory and, when a sheet is
configured, mirrors them to Google Sheets: read once on load, written
through on change. Configure it in `src/sheetsSync.js`:

```js
window.KuBi.SHEETS_CONFIG = { url: '<web app /exec URL>', token: '<token>' };
```

`apps-script/KuBi_History.gs` is the other half — paste it into the
sheet's Apps Script editor and deploy it as a web app. Deployment steps
are in the file's header comment.

**Leave `SHEETS_CONFIG` empty and nothing reaches the network.** History
then lives for the session only, exactly as it did before, and MIS
reports no history rather than inventing averages. The clinic can still
open with no internet: writes made while offline are held and sent when
the sheet is reachable again, and an unreachable sheet is never treated
as an empty one.

Reads stay synchronous, because MIS calls them while rendering. The sheet
arrives afterwards, so `historyStore.subscribe()` tells MIS to re-render
when it lands — the one change this needed outside `historyStore`.

`buildSnapshot()` in `src/history.js` and `HEADERS` in the .gs file are
one contract. Add new fields at the end of both.
