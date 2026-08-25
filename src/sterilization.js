// sterilization.js — instrument pack tracking through the operational
// chain. Each sealed pouch is tracked individually.
//
//   Used -> Dirty -> Cleaned -> Packed -> Sterilized -> Stored -> Available
//
// Only the last stage means an instrument can actually be used on a
// patient, so "ready" counts Available packs, not total packs.

window.KuBi = window.KuBi || {};

function s(en, hi) { return { en: en, hi: hi }; }

window.KuBi.STER_STAGES = ['used', 'dirty', 'cleaned', 'packed', 'sterilized', 'stored', 'available'];

// Mock packs spread across the chain so the workflow is visible at once.
window.KuBi.STER_PACKS = [
  { id: 'PK-101', contents: 'RCT kit', stage: 'available',  at: new Date(Date.now() - 20 * 3600000), by: 'Suresh Kumar' },
  { id: 'PK-102', contents: 'Examination kit', stage: 'available', at: new Date(Date.now() - 20 * 3600000), by: 'Suresh Kumar' },
  { id: 'PK-103', contents: 'Scaling kit', stage: 'available', at: new Date(Date.now() - 19 * 3600000), by: 'Suresh Kumar' },
  { id: 'PK-104', contents: 'Surgical kit', stage: 'sterilized', at: new Date(Date.now() - 45 * 60000), by: 'Suresh Kumar' },
  { id: 'PK-105', contents: 'Crown prep kit', stage: 'packed', at: new Date(Date.now() - 30 * 60000), by: 'Suresh Kumar' },
  { id: 'PK-106', contents: 'Extraction kit', stage: 'cleaned', at: new Date(Date.now() - 15 * 60000), by: 'Priya Sharma' },
  { id: 'PK-107', contents: 'RCT kit', stage: 'dirty', at: new Date(Date.now() - 8 * 60000), by: 'Priya Sharma' },
];

window.KuBi.sterStats = function (packs) {
  const list = packs || [];
  const available = list.filter(function (p) { return p.stage === 'available'; }).length;
  // Anything not yet available is still somewhere in the chain.
  const pending = list.filter(function (p) { return p.stage !== 'available'; }).length;
  return {
    total: list.length,
    available: available,
    pending: pending,
    ready: pending === 0,
  };
};

// Who may see and drive the detailed pack workflow. Everyone else gets
// the one-line summary only.
window.KuBi.STER_DETAIL_ROLES = ['sterilization_technician', 'lead_dental_assistant', 'owner_admin', 'clinic_manager'];

window.KuBi.canSeeSterDetail = function (roleId) {
  return window.KuBi.STER_DETAIL_ROLES.indexOf(roleId) !== -1;
};

window.KuBi.nextSterStage = function (stage) {
  const i = window.KuBi.STER_STAGES.indexOf(stage);
  if (i === -1 || i === window.KuBi.STER_STAGES.length - 1) return null;
  return window.KuBi.STER_STAGES[i + 1];
};
