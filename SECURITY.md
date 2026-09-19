# Security — where KuBi stands, and what is deliberately unfinished

Written 2 September 2026. This describes the *current* arrangement honestly
rather than an aspirational one. Nothing here is a plan of work; it exists so
the decision before production deployment is made from facts rather than
reconstructed from memory.

## The short version

KuBi authenticates to Google Sheets with **a shared token embedded in
`KuBi.html`** — a file that is deliberately copied onto clinic computers.
Anyone holding that file holds the token. That is adequate for a pilot and is
**not a finished security architecture for production**.

---

## What is actually stored, and where

The Apps Script keeps four tabs in one spreadsheet.

### `KuBi Day` — identifiable, and the reason this matters

One row per date, holding the live operating day as JSON. It contains the
appointment list, and an appointment carries:

    patient · treatment · doctor · chair · procedureType · status
    currentStageName · caseStages · times

So a stored day says **that a named person is having a named treatment
today, with which dentist, and how far through it they are.** That is
identifiable health information.

Also in the day: readiness ticks (with the name of who ticked them),
treatment checklists, procedure timestamps, equipment faults, repair
reports, lab receipts.

### `KuBi History` — not identifiable

One row per finished day, counts only: booked, arrived, completed, no-shows,
waits, readiness percentage, exception totals and kinds, cases open,
follow-ups due. **No names.** A leak here is commercially uncomfortable, not
a patient confidentiality matter.

### `KuBi Day Backup` — identifiable, same as `KuBi Day`

Periodic copies of the day, so the same contents and the same care.

### `KuBi Case Visits` — pseudonymous

One row per case per date: case id, date, stage name, times, and the
dentist's and documenting staff member's names. **No patient names, no
diagnosis.** The case id (e.g. `AP0311-RCT_MOLAR-01`) is a key into
the case list, not a name — but together with the day rows it re-identifies,
so treat it as part of the same sheet, not a separately safe one.

### Not stored in the sheet at all

`CASES` — which is the only place a **diagnosis** appears — is module data
compiled into `KuBi.html`. It is not part of `DAY_FIELDS` and never reaches
the spreadsheet. This is currently true by accident rather than by policy: if
cases ever become editable, that decision needs making deliberately.

---

## What the token protects, and what it cannot

The deployment must be **"Execute as: Me, Who has access: Anyone"**, because a
clinic PC opening a local HTML file has no Google session to present. The
token is therefore the only check the endpoint performs.

**The token cannot be kept secret by construction.** It lives inside a file
that is copied onto clinic computers, emailed, and carried on USB sticks. It
is a password printed on every copy of the door it opens.

It defends against exactly one thing: somebody who has learned the `/exec`
URL — from a browser history, a shared screen, a forwarded link — and nothing
else.

It does **not** provide:

- **per-user identity** — every request is anonymous; there is no record of
  who read or changed anything
- **revocation for one person** — rotating the token invalidates every copy of
  `KuBi.html` at once
- **any limit on what a holder may do** — read the day, overwrite the day,
  read all history, or delete history rows

### Blast radius, precisely

A leaked token is **not** access to the Google account. The script only ever
touches `SpreadsheetApp.getActiveSpreadsheet()` — the one spreadsheet it is
bound to. A holder can:

| action | effect |
|---|---|
| `dayGet` | read today's clinic, including patient names |
| `dayPut` | overwrite today's clinic — operational sabotage, not just disclosure |
| `historyAll` | read all historical counts |
| `historyPut` / `historyRemove` | alter or delete history |

`ping` is deliberately unauthenticated. It returns only the app name and
version, so connectivity can be diagnosed without handing anyone the token.

---

## How this got here

When the token was introduced, the endpoint held **history only** — counts,
no names. Losing them would have been an inconvenience.

Two features later (V2.4 lab, V2.5 follow-up, and persistence generally) the
same endpoint holds **the live day, with patient names**. The sensitivity of
what the token protects rose materially; the protection did not change. That
is the actual defect, and it is a process one rather than a coding one.

---

## Options, when this is addressed

### 1. Serve KuBi from Apps Script itself — the smallest real fix

Deliver the app through `HtmlService` and talk to the sheet with
`google.script.run`. **The shared secret disappears entirely.** Google
authenticates each staff member, giving per-user identity, per-user
revocation, and an access trail. There is nothing left in the file to leak.

The cost is the double-click-from-disk property. Note that this is **already
partly spent**: since persistence landed, KuBi needs the network for the day
to survive a refresh. The offline promise today is "keeps working if the
connection drops mid-day", not "works with no internet at all".

If that trade is acceptable, this is the least work for the most benefit.

### 2. A server-side boundary

A small service (Cloud Run, or similar) holding the credential, with its own
login and audit log. More control, and infrastructure a dental clinic then
has to keep running. Worth it only if requirements arrive that option 1
cannot meet.

### 3. Mitigations that do not fix it

Useful only as interim measures, and they should not be mistaken for a
solution: a token per device, scheduled rotation, dropping `historyRemove`
from the deployed script, or logging every write with a device identifier.

---

## If the token is believed to have leaked

In this order:

1. Change `TOKEN` in `apps-script/KuBi_History.gs`
2. **Deploy → Manage deployments → New version.** Saving alone does not
   publish; the old code keeps serving until a new version is deployed
3. Change `token` in `SHEETS_CONFIG` at the top of `src/sheetsSync.js`
4. `npm run build`, and replace `KuBi.html` on every clinic machine

Between steps 2 and 4 the clinic cannot sync. Every copy of the old file
stops working at step 2, which is the point.

## Operating notes for the pilot

- Treat `KuBi.html` as clinic property. It is not a document to email around.
- The repository is private, and the token is committed to it. Anyone given
  repository access is given the endpoint.
- A shared clinic PC left signed in exposes the day to whoever sits down. The
  app has PIN sign-in per role, but that is a workflow boundary, not a
  security one — the data is in the file either way.
