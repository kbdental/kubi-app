// treatmentChecklists.js — per-procedure-type readiness checks.
// TREATMENT_CHECKLISTS = "Before Procedure" (replaces the earlier version).
// TREATMENT_CHECKLISTS_AFTER = "After Procedure" — stored now, not yet
// wired into the UI (Treatment Prep only shows before-procedure state
// until a before/after view is built).

window.KuBi = window.KuBi || {};

window.KuBi.TREATMENT_CHECKLISTS = {
  'Consultation':              ['Medical history', 'Previous records', 'Relevant X-ray', 'Examination requirements'],
  'Scaling':                   ['Medical history', 'Periodontal assessment', 'X-ray if required', 'Instruments', 'Materials'],
  'Filling':                   ['Diagnosis', 'X-ray if required', 'Consent', 'Anaesthesia', 'Instruments/materials'],
  'RCT':                       ['Medical history', 'Relevant X-ray', 'Consent', 'Required instruments/materials', 'Pre-op documentation'],
  'Re-RCT':                    ['Previous RCT records', 'X-ray/CBCT', 'Consent', 'Retreatment instruments/materials', 'Pre-op documentation'],
  'Post & Core':                ['Completed RCT', 'X-ray', 'Consent', 'Post system', 'Core material', 'Instruments'],
  'Crown':                      ['Diagnosis', 'Tooth preparation', 'Consent', 'Scan/impression', 'Bite/shade', 'Lab work', 'Crown availability'],
  'Bridge':                     ['Diagnosis', 'Preparation', 'Consent', 'Scan/impression', 'Bite/shade', 'Lab work', 'Bridge availability'],
  'Veneer':                     ['Diagnosis', 'Photographs', 'Shade', 'Consent', 'Preparation', 'Scan/impression', 'Lab work', 'Veneer availability'],
  'Smile Design':               ['Examination', 'Photographs', 'Scan', 'Smile analysis', 'Treatment plan', 'Design'],
  'Whitening':                  ['Examination', 'Shade', 'Consent', 'Whitening material', 'Equipment', 'Isolation'],
  'Extraction':                 ['Medical history', 'X-ray', 'Correct tooth', 'Consent', 'Anaesthesia', 'Instruments', 'Haemostatic material'],
  'Surgical Extraction':        ['Medical history', 'X-ray/CBCT', 'Consent', 'Surgical kit', 'Sterile instruments', 'Anaesthesia', 'Sutures', 'Emergency readiness'],
  'Wisdom Tooth Surgery':       ['Medical history', 'X-ray/CBCT', 'Surgical assessment', 'Consent', 'Surgical kit', 'Sterile instruments', 'Sutures', 'Emergency readiness'],
  'Implant Surgery':            ['Medical history', 'Investigations', 'Consent', 'Pre-op scan/X-ray', 'Medicine instructions', 'Meal instructions', 'Implant availability', 'Surgical kit', 'Sterile instruments', 'Emergency readiness'],
  'Bone Grafting':              ['Medical history', 'CBCT', 'Consent', 'Graft availability', 'Membrane if required', 'Surgical kit', 'Sterile instruments'],
  'Sinus Lift':                 ['Medical history', 'CBCT', 'Consent', 'Graft/materials', 'Surgical kit', 'Sterile instruments', 'Implant availability if required', 'Emergency readiness'],
  'Implant Prosthesis':         ['Implant record', 'Healing status', 'Scan/impression', 'Bite/shade', 'Components', 'Lab work', 'Prosthesis availability'],
  'Denture':                    ['Diagnosis', 'Consent', 'Impression', 'Bite', 'Tooth selection/shade', 'Lab work', 'Denture availability'],
  'Full Mouth Rehabilitation':  ['Medical history', 'Investigations', 'Photographs/scan', 'Diagnosis', 'Treatment plan', 'Consent', 'Preliminary treatments', 'Lab readiness'],
  'Aligner':                    ['Diagnosis', 'X-rays', 'Scan', 'Treatment plan', 'Consent', 'Digital plan', 'Aligners', 'Attachments/IPR requirements'],
  'Braces':                     ['Diagnosis', 'X-rays', 'Treatment plan', 'Consent', 'Brackets', 'Bonding materials', 'Wires', 'Instruments'],
  'Retainer':                   ['Treatment status', 'Correct retainer', 'Correct patient', 'Fit requirements'],
  'Periodontal Surgery':        ['Medical history', 'Periodontal assessment', 'X-ray', 'Consent', 'Surgical kit', 'Sterile instruments', 'Materials', 'Emergency readiness'],
  'Paediatric Treatment':       ['Medical history', 'Diagnosis', 'X-ray', 'Guardian consent', 'Required instruments/materials', 'Anaesthesia if required'],
  'Pulpotomy/Pulpectomy':       ['Diagnosis', 'X-ray', 'Guardian consent', 'Anaesthesia', 'Instruments/materials', 'Restoration requirements'],
  'TMD Assessment':             ['Medical history', 'Pain history', 'TMJ examination', 'Occlusal examination', 'Imaging if required'],
  'Night Guard/Splint':         ['Diagnosis', 'Occlusal assessment', 'Scan/impression', 'Bite', 'Consent', 'Lab work', 'Splint availability'],
};

window.KuBi.TREATMENT_CHECKLISTS_AFTER = {
  'Consultation':              ['Diagnosis', 'Treatment plan', 'Advice', 'Next appointment', 'Clinical notes'],
  'Scaling':                   ['Treatment recorded', 'Findings', 'Oral hygiene instructions', 'Recall', 'Clinical notes'],
  'Filling':                   ['Tooth/restoration recorded', 'Material used', 'Occlusion', 'Instructions', 'Clinical notes'],
  'RCT':                       ['Treatment documentation', 'Required X-ray', 'Materials used', 'Post-op instructions', 'Next appointment'],
  'Re-RCT':                    ['Treatment documentation', 'Final X-ray', 'Materials used', 'Post-op instructions', 'Next appointment'],
  'Post & Core':                ['Post details', 'X-ray', 'Materials used', 'Restoration plan', 'Clinical notes'],
  'Crown':                      ['Fit', 'Contacts', 'Occlusion', 'Cementation', 'Instructions', 'Follow-up', 'Clinical notes'],
  'Bridge':                     ['Fit', 'Contacts', 'Occlusion', 'Cementation', 'Instructions', 'Follow-up', 'Clinical notes'],
  'Veneer':                     ['Fit', 'Shade', 'Occlusion', 'Bonding', 'Photographs', 'Instructions', 'Clinical notes'],
  'Smile Design':               ['Design recorded', 'Patient decision', 'Final plan', 'Records saved', 'Next step'],
  'Whitening':                  ['Final shade', 'Sensitivity', 'Result recorded', 'Instructions', 'Recall'],
  'Extraction':                 ['Tooth recorded', 'Extraction documented', 'Haemostasis', 'Medication', 'Instructions', 'Follow-up'],
  'Surgical Extraction':        ['Procedure documented', 'Findings', 'Sutures', 'Haemostasis', 'Medication', 'Instructions', 'Follow-up'],
  'Wisdom Tooth Surgery':       ['Procedure documented', 'Findings', 'Sutures', 'Medication', 'Instructions', 'Follow-up'],
  'Implant Surgery':            ['Implant details', 'Surgical documentation', 'X-ray if required', 'Medicines', 'Post-op instructions', 'Follow-up'],
  'Bone Grafting':              ['Graft details', 'Surgical documentation', 'Medication', 'Post-op instructions', 'Follow-up'],
  'Sinus Lift':                 ['Surgical documentation', 'Graft details', 'Medication', 'Sinus instructions', 'Follow-up'],
  'Implant Prosthesis':         ['Prosthesis details', 'Fit', 'Occlusion', 'Torque', 'X-ray if required', 'Instructions', 'Recall'],
  'Denture':                    ['Fit', 'Occlusion', 'Adjustments', 'Delivery', 'Care instructions', 'Follow-up'],
  'Full Mouth Rehabilitation':  ['Stage completed', 'Work documented', 'Materials/prosthesis', 'Occlusion/function', 'Next stage', 'Clinical notes'],
  'Aligner':                    ['Aligner stage', 'Fit', 'Attachments/IPR', 'Instructions', 'Next stage', 'Next appointment'],
  'Braces':                     ['Brackets/wires recorded', 'Adjustments', 'Instructions', 'Next appointment'],
  'Retainer':                   ['Retainer delivered', 'Fit', 'Instructions', 'Follow-up'],
  'Periodontal Surgery':        ['Procedure documented', 'Findings', 'Materials', 'Sutures', 'Medication', 'Instructions', 'Follow-up'],
  'Paediatric Treatment':       ['Treatment recorded', 'Tooth', 'Materials', 'Guardian instructions', 'Follow-up'],
  'Pulpotomy/Pulpectomy':       ['Treatment documented', 'X-ray if required', 'Materials', 'Restoration', 'Instructions', 'Follow-up'],
  'TMD Assessment':             ['Findings', 'Diagnosis', 'Treatment plan', 'Patient instructions', 'Follow-up'],
  'Night Guard/Splint':         ['Fit', 'Occlusion', 'Adjustments', 'Instructions', 'Follow-up'],
};

window.KuBi.TREATMENT_TYPES = Object.keys(window.KuBi.TREATMENT_CHECKLISTS);

window.KuBi.treatmentReadyStats = function (procedureType, checkedMap) {
  const steps = window.KuBi.TREATMENT_CHECKLISTS[procedureType] || [];
  const map = checkedMap || {};
  const missing = steps.filter(function (_, i) { return !map[i]; });
  return {
    total: steps.length,
    done: steps.length - missing.length,
    missing: missing,
    ready: steps.length > 0 && missing.length === 0,
  };
};

window.KuBi.treatmentAfterStats = function (procedureType, checkedMap) {
  const steps = window.KuBi.TREATMENT_CHECKLISTS_AFTER[procedureType] || [];
  const map = checkedMap || {};
  const missing = steps.filter(function (_, i) { return !map[i]; });
  return {
    total: steps.length,
    done: steps.length - missing.length,
    missing: missing,
    complete: steps.length > 0 && missing.length === 0,
  };
};

// ---- Case closure gate -------------------------------------------------
// A case cannot close until all four requirements are satisfied:
//   documentation · instructions · records · nextStep
// Rather than maintain a parallel checklist, we classify the EXISTING
// after-procedure items into these four categories by keyword. Any item
// that doesn't match a category is still required for the checklist to be
// complete, but isn't itself a gate condition.
window.KuBi.CLOSURE_CATEGORIES = ['documentation', 'instructions', 'records', 'nextStep'];

window.KuBi.classifyAfterStep = function (step) {
  const s = String(step).toLowerCase();
  if (s.indexOf('instruction') !== -1 || s.indexOf('advice') !== -1) return 'instructions';
  if (s.indexOf('follow-up') !== -1 || s.indexOf('follow up') !== -1 || s.indexOf('next appointment') !== -1
      || s.indexOf('recall') !== -1 || s.indexOf('next stage') !== -1 || s.indexOf('next step') !== -1
      || s.indexOf('treatment plan') !== -1 || s.indexOf('restoration plan') !== -1) return 'nextStep';
  if (s.indexOf('document') !== -1 || s.indexOf('clinical notes') !== -1 || s.indexOf('recorded') !== -1
      || s.indexOf('findings') !== -1 || s.indexOf('diagnosis') !== -1) return 'documentation';
  if (s.indexOf('x-ray') !== -1 || s.indexOf('photograph') !== -1 || s.indexOf('records saved') !== -1
      || s.indexOf('shade') !== -1 || s.indexOf('material') !== -1 || s.indexOf('details') !== -1
      || s.indexOf('medication') !== -1 || s.indexOf('medicines') !== -1) return 'records';
  return null;
};

// Which closure categories this procedure actually has items for, and
// whether each is satisfied. Categories a procedure has no items for are
// treated as not applicable rather than blocking.
window.KuBi.closureGate = function (procedureType, checkedMap) {
  const steps = window.KuBi.TREATMENT_CHECKLISTS_AFTER[procedureType] || [];
  const map = checkedMap || {};
  const result = { applicable: [], satisfied: [], missing: [], canClose: false };

  window.KuBi.CLOSURE_CATEGORIES.forEach(function (cat) {
    const idxs = [];
    steps.forEach(function (step, i) {
      if (window.KuBi.classifyAfterStep(step) === cat) idxs.push(i);
    });
    if (idxs.length === 0) return; // not applicable to this procedure
    result.applicable.push(cat);
    const allDone = idxs.every(function (i) { return map[i]; });
    if (allDone) {
      result.satisfied.push(cat);
    } else {
      result.missing.push({ category: cat, steps: idxs.filter(function (i) { return !map[i]; }).map(function (i) { return steps[i]; }) });
    }
  });

  // Every after-item must also be ticked — the four categories are the
  // headline requirements, not a way to skip the rest of the checklist.
  const allTicked = steps.length > 0 && steps.every(function (_, i) { return map[i]; });
  result.canClose = allTicked && result.missing.length === 0;
  return result;
};
