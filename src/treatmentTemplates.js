// treatmentTemplates.js — V2.2. What a procedure BRINGS WITH IT.
//
//     Procedure → stages → before → materials / lab → after → closure
//
// The point of a template is that staff never build a workflow. Choosing
// "Crown" should bring the stages, the pre-treatment requirements, the
// materials, whether a lab is involved, the post-treatment requirements
// and the closure gate — all of it, without anybody assembling a
// checklist by hand.
//
// THIS MODULE ASSEMBLES, IT DOES NOT DUPLICATE.
// Before, after and closure already existed for all 28 procedure types and
// are still owned by treatmentChecklists.js; materials by inventory.js.
// treatmentTemplate() reads those. What is genuinely new here is the two
// pieces that were missing: the STAGES a procedure runs through, and
// whether it NEEDS A LAB.
//
// ⚠ THE STAGE LISTS AND THE ADDED MATERIAL MAPPINGS NEED A DENTIST'S
//   REVIEW. They are standard sequences and reuse only materials the
//   clinic already tracks, but they were written from the existing data,
//   not from the clinic's own protocol. Nothing here invents a material
//   the inventory does not already carry.

window.KuBi = window.KuBi || {};

function s(en, hi) { return { en: en, hi: hi }; }

// The stages a procedure runs through, in order. One entry means a
// single-visit procedure — which is still a stage, so that every case can
// be asked the same questions.
window.KuBi.TREATMENT_STAGES = {
  'Consultation':              [s('Consultation', 'परामर्श')],
  'Scaling':                   [s('Scaling + polishing', 'स्केलिंग और पॉलिशिंग')],
  'Filling':                   [s('Filling', 'फिलिंग')],
  'RCT':                       [s('Cleaning', 'सफाई'), s('Cleaning / medication', 'सफाई / दवा'),
                                s('Obturation', 'ऑब्चुरेशन'), s('Restoration', 'रीस्टोरेशन')],
  'Re-RCT':                    [s('Removal of old filling', 'पुरानी फिलिंग हटाना'), s('Cleaning / medication', 'सफाई / दवा'),
                                s('Obturation', 'ऑब्चुरेशन'), s('Restoration', 'रीस्टोरेशन')],
  'Post & Core':               [s('Post space preparation', 'पोस्ट स्पेस की तैयारी'), s('Core build-up', 'कोर बिल्ड-अप')],
  'Crown':                     [s('Preparation', 'तैयारी'), s('Try-in', 'ट्राई-इन'), s('Final fitting', 'फाइनल फिटिंग')],
  'Bridge':                    [s('Preparation', 'तैयारी'), s('Try-in', 'ट्राई-इन'), s('Final fitting', 'फाइनल फिटिंग')],
  'Veneer':                    [s('Preparation', 'तैयारी'), s('Try-in', 'ट्राई-इन'), s('Bonding', 'बॉन्डिंग')],
  'Smile Design':              [s('Assessment and mock-up', 'जांच और मॉक-अप'), s('Preparation', 'तैयारी'),
                                s('Try-in', 'ट्राई-इन'), s('Fitting', 'फिटिंग')],
  'Whitening':                 [s('Assessment', 'जांच'), s('Whitening session', 'व्हाइटनिंग सेशन'), s('Review', 'रिव्यू')],
  'Extraction':                [s('Extraction', 'दांत निकालना')],
  'Surgical Extraction':       [s('Surgical extraction', 'सर्जिकल एक्सट्रैक्शन'), s('Suture removal', 'टांके निकालना')],
  'Wisdom Tooth Surgery':      [s('Surgery', 'सर्जरी'), s('Suture removal', 'टांके निकालना'), s('Review', 'रिव्यू')],
  'Implant Surgery':           [s('Implant placement', 'इम्प्लांट लगाना'), s('Suture removal', 'टांके निकालना'),
                                s('Healing review', 'हीलिंग रिव्यू')],
  'Bone Grafting':             [s('Grafting', 'ग्राफ्टिंग'), s('Suture removal', 'टांके निकालना'), s('Healing review', 'हीलिंग रिव्यू')],
  'Sinus Lift':                [s('Sinus lift', 'साइनस लिफ्ट'), s('Suture removal', 'टांके निकालना'), s('Healing review', 'हीलिंग रिव्यू')],
  'Implant Prosthesis':        [s('Scan / impression', 'स्कैन / इम्प्रेशन'), s('Try-in', 'ट्राई-इन'), s('Fitting', 'फिटिंग')],
  'Denture':                   [s('Primary impression', 'पहला इम्प्रेशन'), s('Final impression', 'फाइनल इम्प्रेशन'),
                                s('Try-in', 'ट्राई-इन'), s('Delivery', 'डिलीवरी')],
  'Full Mouth Rehabilitation': [s('Assessment and planning', 'जांच और योजना'), s('Preparation', 'तैयारी'),
                                s('Try-in', 'ट्राई-इन'), s('Delivery', 'डिलीवरी'), s('Review', 'रिव्यू')],
  'Aligner':                   [s('Records and scan', 'रिकॉर्ड और स्कैन'), s('Aligner delivery', 'अलाइनर डिलीवरी'),
                                s('Progress review', 'प्रगति रिव्यू'), s('Retention', 'रिटेंशन')],
  'Braces':                    [s('Records and bonding', 'रिकॉर्ड और बॉन्डिंग'), s('Adjustment', 'एडजस्टमेंट'),
                                s('Debonding', 'डीबॉन्डिंग'), s('Retention', 'रिटेंशन')],
  'Retainer':                  [s('Impression', 'इम्प्रेशन'), s('Delivery', 'डिलीवरी')],
  'Periodontal Surgery':       [s('Surgery', 'सर्जरी'), s('Suture removal', 'टांके निकालना'), s('Healing review', 'हीलिंग रिव्यू')],
  'Paediatric Treatment':      [s('Treatment', 'इलाज')],
  'Pulpotomy/Pulpectomy':      [s('Pulpotomy / pulpectomy', 'पल्पोटॉमी / पल्पेक्टॉमी'), s('Restoration', 'रीस्टोरेशन')],
  'TMD Assessment':            [s('Assessment', 'जांच'), s('Review', 'रिव्यू')],
  'Night Guard/Splint':        [s('Impression', 'इम्प्रेशन'), s('Delivery', 'डिलीवरी'), s('Review', 'रिव्यू')],
};

// Does this procedure involve work going out to a laboratory? This is what
// lets KuBi expect a lab case rather than waiting to be told about one.
window.KuBi.TREATMENT_NEEDS_LAB = {
  'Crown': true, 'Bridge': true, 'Veneer': true, 'Smile Design': true,
  'Implant Prosthesis': true, 'Denture': true, 'Full Mouth Rehabilitation': true,
  'Aligner': true, 'Retainer': true, 'Night Guard/Splint': true,
};

// Material mappings for the procedures that had none. Only materials the
// clinic already tracks — nothing invented. ⚠ needs a dentist's review.
window.KuBi.PROCEDURE_MATERIALS_V2 = {
  'Re-RCT':                    ['gutta_percha', 'endo_files', 'anaesthetic'],
  'Post & Core':               ['cement', 'composite'],
  'Smile Design':              ['impression', 'cement'],
  'Whitening':                 ['gloves'],
  'Wisdom Tooth Surgery':      ['anaesthetic', 'gauze', 'sutures'],
  'Bone Grafting':             ['anaesthetic', 'sutures', 'gauze'],
  'Sinus Lift':                ['anaesthetic', 'sutures', 'gauze'],
  'Denture':                   ['impression'],
  'Full Mouth Rehabilitation': ['impression', 'cement'],
  'Aligner':                   ['impression'],
  'Braces':                    ['impression'],
  'Retainer':                  ['impression'],
  'Periodontal Surgery':       ['anaesthetic', 'sutures', 'gauze'],
  'Paediatric Treatment':      ['anaesthetic', 'composite'],
  'Pulpotomy/Pulpectomy':      ['anaesthetic', 'composite'],
  'Night Guard/Splint':        ['impression'],
};

/** Stage names for a procedure, in the chosen language. */
window.KuBi.templateStages = function (procedureType, lang) {
  const stages = window.KuBi.TREATMENT_STAGES[procedureType] || [];
  return stages.map(function (st) { return (lang && st[lang]) || st.en; });
};

/**
 * Everything a procedure brings with it, in one place. The before, after
 * and closure lists are READ from where they already live; only stages and
 * the lab flag originate here.
 */
window.KuBi.treatmentTemplate = function (procedureType, lang) {
  const known = !!window.KuBi.TREATMENT_STAGES[procedureType];
  const materials = (window.KuBi.PROCEDURE_MATERIALS || {})[procedureType]
                 || window.KuBi.PROCEDURE_MATERIALS_V2[procedureType]
                 || [];
  return {
    procedureType: procedureType,
    known: known,
    stages: window.KuBi.templateStages(procedureType, lang),
    before: (window.KuBi.TREATMENT_CHECKLISTS || {})[procedureType] || [],
    after: (window.KuBi.TREATMENT_CHECKLISTS_AFTER || {})[procedureType] || [],
    closureCategories: window.KuBi.CLOSURE_CATEGORIES || [],
    materials: materials.map(function (id) { return window.KuBi.materialById(id); }).filter(Boolean),
    needsLab: !!window.KuBi.TREATMENT_NEEDS_LAB[procedureType],
  };
};

/**
 * The stages a NEW case of this type starts with — none of them done.
 * This is the "staff never build the checklist" call: a case is created
 * from its procedure, not assembled by hand.
 */
window.KuBi.stagesForNewCase = function (procedureType, lang) {
  return window.KuBi.templateStages(procedureType, lang).map(function (name, i) {
    return { name: name, done: false, current: i === 0 };
  });
};

/** Which procedure types are missing something a template should provide. */
window.KuBi.templateGaps = function () {
  return (window.KuBi.TREATMENT_TYPES || []).filter(function (t) {
    const tpl = window.KuBi.treatmentTemplate(t);
    return !tpl.stages.length || !tpl.before.length || !tpl.after.length;
  });
};
