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
npm test          # builds, then runs 163 journey checks + 7 bundle checks
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
  patientCheckIn.js    Appointments, journey stages, follow-ups, lapsed
  cases.js             THE CASE — the thread joining all of the above
  treatmentChecklists.js  27 procedures, before/after, closure gate
  attention.js         What needs attention, with owner + reason
  equipment.js         Equipment status list
  repairs.js           Building faults, open until fixed
  sterilization.js     Instrument pack chain
  inventory.js         Materials mapped to procedures
  nextAction.js        THE PRIORITY ENGINE — one action from 8 states
  mis.js               Management KPI computation
  dayStore.js          The operating day, as stored and restored
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

## Screens

Built for a clinic PC, and usable on a tablet or phone. Under 900px the
sidebar becomes a bottom tab bar, tab rows scroll sideways instead of
stacking, and rows built for a wide screen wrap rather than run off the
edge. The desktop layout is unchanged — every responsive rule is additive
and lives at the end of `index.html`.

Deliberately NOT `overflow-x: hidden`: hiding an overflow puts content out
of reach with no sign it is there. Anything that cannot fit wraps or
scrolls in its own box.

## The Case

`cases.js` is the thread: **Patient → Case → Stage → Visit → Closure**. It is
not a screen, and there is no Cases area — a case is reached by clicking a
patient, a treatment, or today's appointment.

One place per fact, so nothing can disagree:

- the case's identity and stage list — `cases.js`
- progress through the stages today — the appointment, because that is the
  live state staff change and the state that persists
- whether today's visit is written up — `closedCases`, as before

`caseThread(caseId, ctx)` assembles them, and the case VIEW renders it —
patient, treatment, diagnosis, current and next stage, every visit, today's
status, then Before / Procedure / After / Closure, lab and follow-up. It
opens over whichever list you were reading and Back returns you there,
because a case is something you click, not somewhere you go. Three states V1 collapsed into one
are now distinct: **treatment done** (today's procedure finished), **visit
documented** (V1's "case closed"), and **case closed** (every stage done and
the last visit written up). A documented visit on a four-stage RCT does not
close the case.

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

The clinic's own deployment is already configured in `SHEETS_CONFIG`. The
URL and token are in this repo and inside `KuBi.html`, because a file
staff open by double-clicking has nowhere else to keep them. Treat both as
private: the deployment must be "Anyone" for a clinic PC to reach it
without a Google login, so the token is what stands between the URL and
the clinic's day. To rotate it, change TOKEN in the .gs, re-deploy as a
NEW VERSION, change `token` here, and rebuild — in that order.

`apps-script/KuBi_History.gs` is the other half — paste it into the
sheet's Apps Script editor and deploy it as a web app. Deployment steps
are in the file's header comment. It keeps two sheets: **KuBi History**,
one row per finished day, and **KuBi Day**, the day in progress.

The day in progress is what makes a refresh survivable. `src/dayStore.js`
lists the twelve pieces of state that make up a day; `useClinicDay()` in
App.jsx reads them back on load and writes them through, 2.5s after the
last change so a burst of ticks is one write, not twenty.

Two rules hold that together, and both are tested:

- **Never write before reading.** On load the state is seed data; saving
  is armed only once the read has come back. Otherwise the first write
  would overwrite a real day with the seed.
- **Unreachable is not empty.** A failed read leaves saving disarmed, so a
  clinic with no internet keeps working in memory and cannot clobber the
  stored day when the connection returns. Reaching the sheet and finding
  nothing is a different answer, and does arm saving — otherwise the first
  day of use would never save at all.

What is NOT stored: which screen somebody was looking at. After a refresh
you land on your own home screen, not the last person's.

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
