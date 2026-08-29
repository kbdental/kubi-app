// clinicReadiness.js — the clinic's own opening procedure, bilingual.
// Every user-facing string is { en, hi }. Schema otherwise unchanged:
// section -> groups -> tasks (checkable) -> details (reference only).

window.KuBi = window.KuBi || {};

function s(en, hi) { return { en: en, hi: hi }; }

window.KuBi.allReadinessTasks = function () {
  const out = [];
  window.KuBi.CLINIC_READINESS.forEach(function (section) {
    // Per-room sections contribute one set of tasks PER ROOM, so the
    // overall readiness % reflects every room needing to be done.
    const rooms = section.perRoom ? window.KuBi.CLINIC_ROOMS : [null];
    rooms.forEach(function (room) {
      section.groups.forEach(function (g, gi) {
        g.tasks.forEach(function (t, ti) {
          out.push(window.KuBi.taskKey(section, gi, ti, room));
        });
      });
    });
  });
  return out;
};

window.KuBi.readinessStats = function (checked) {
  const all = window.KuBi.allReadinessTasks();
  const done = all.filter(function (k) { return checked[k]; }).length;
  return { done: done, total: all.length, pct: all.length ? Math.round(done / all.length * 100) : 0 };
};

// The morning gate: every readiness task EXCEPT the ones that belong to
// closing (fumigation), which are end-of-day work and must not be counted
// against the opening checklist. Returns the first outstanding task's
// section and room so callers can point straight at the work.
window.KuBi.openingReadinessStats = function (checked) {
  let done = 0;
  let total = 0;
  let firstPending = null;
  window.KuBi.CLINIC_READINESS.forEach(function (section) {
    if (window.KuBi.CLINIC_SUBTAB_OF[section.id] === 'closing') return;
    const rooms = section.perRoom ? window.KuBi.CLINIC_ROOMS : [null];
    rooms.forEach(function (room) {
      section.groups.forEach(function (g, gi) {
        g.tasks.forEach(function (t, ti) {
          total++;
          if (checked[window.KuBi.taskKey(section, gi, ti, room)]) done++;
          else if (!firstPending) firstPending = { section: section, room: room };
        });
      });
    });
  });
  return {
    done: done, total: total, pending: total - done,
    complete: total > 0 && done === total,
    firstPending: firstPending,
  };
};

window.KuBi.CLINIC_READINESS = [
  {
    id: 'staff_entry',
    title: s('1. Staff Entry & Personal Hygiene Protocol', '1. स्टाफ एंट्री और व्यक्तिगत स्वच्छता नियम'),
    subtitle: s('To be completed before any clinical or administrative activity begins', 'किसी भी क्लिनिकल या प्रशासनिक काम शुरू करने से पहले पूरा करें'),
    ownerRole: null, contingencyRole: null,
    groups: [{ title: null, tasks: [
      { label: s('Arrive in regular clothing and change on-site', 'सामान्य कपड़ों में आएं और क्लिनिक में आकर बदलें'), details: [s('Wear regular clothing while commuting to the clinic.', 'क्लिनिक आते समय सामान्य कपड़े पहनें।')] },
      { label: s('Remove footwear and switch to clinic slippers on entry', 'अंदर आते ही जूते उतारें और क्लिनिक की चप्पल पहनें'), details: [] },
      { label: s('Wash hands per K.B. Dental Hand Hygiene Protocol', 'K.B. Dental हैंड हाइजीन प्रोटोकॉल के अनुसार हाथ धोएं'), details: [s('Minimum 20 seconds, soap and water, covering all surfaces.', 'कम से कम 20 सेकंड, साबुन और पानी से, हाथ के हर हिस्से को धोएं।')] },
      { label: s('Disinfect hands with alcohol-based sanitizer', 'अल्कोहल-आधारित सैनिटाइज़र से हाथ साफ करें'), details: [] },
      { label: s('Change into uniform, 3-layered surgical mask, and head cap', 'यूनिफॉर्म, 3-लेयर सर्जिकल मास्क और हेड कैप पहनें'), details: [] },
      { label: s('Wear a fresh, laundered uniform every day', 'हर दिन साफ, धुली हुई यूनिफॉर्म पहनें'), details: [s('No exceptions — uniforms must be washed daily.', 'कोई अपवाद नहीं — यूनिफॉर्म रोज़ धोई जानी चाहिए।')] },
      { label: s('House Keeping wears gloves for all cleaning tasks', 'हाउस कीपिंग स्टाफ सफाई के हर काम में दस्ताने पहनें'), details: [] },
    ]}],
  },
  {
    id: 'operatory',
    perRoom: true,
    title: s('2.1 Operatory Cleaning & Disinfection', '2.1 ऑपरेटरी की सफाई और डिसइन्फेक्शन'),
    subtitle: s('Before arrival of doctor and patient — alcohol-based disinfectant (e.g. Bacilol) unless noted', 'डॉक्टर और मरीज़ आने से पहले — जब तक न लिखा हो, अल्कोहल-आधारित डिसइन्फेक्टेंट (जैसे Bacilol) इस्तेमाल करें'),
    ownerRole: 'lead_dental_assistant', contingencyRole: 'sterilization_technician',
    groups: [
      { title: s('A. Dental Chair', 'A. डेंटल चेयर'), tasks: [
        { label: s('Disinfect the dental chair and all attachments', 'डेंटल चेयर और उसके सभी हिस्सों को डिसइन्फेक्ट करें'), details: [
          s('Instrument tray, chair upholstery/seat, patient headrest, patient armrest', 'इंस्ट्रूमेंट ट्रे, चेयर सीट, हेडरेस्ट, आर्मरेस्ट'),
          s('Dental light handle, spittoon tray and metal/plastic tube', 'डेंटल लाइट हैंडल, स्पिटून ट्रे और ट्यूब'),
          s('Suction filter — remove from casing, clean under running water, disinfect; clean internal casing too', 'सक्शन फ़िल्टर — केसिंग से निकालें, बहते पानी में धोएं, डिसइन्फेक्ट करें; अंदर की केसिंग भी साफ करें'),
          s('All surfaces of the doctor\u2019s stool', 'डॉक्टर के स्टूल की सभी सतहें'),
          s('External surfaces of handpiece tubes: Air-Rotor, Air Motor, Scaler, Suction, Three-way Syringe', 'हैंडपीस ट्यूब की बाहरी सतह: एयर-रोटर, एयर मोटर, स्केलर, सक्शन, थ्री-वे सिरिंज'),
        ]},
        { label: s('Wrap cling film over tray, armrest, headrest, light handle, syringe and suction tube', 'ट्रे, आर्मरेस्ट, हेडरेस्ट, लाइट हैंडल, सिरिंज और सक्शन ट्यूब पर क्लिंग फिल्म लगाएं'), details: [s('Done after disinfection is complete.', 'डिसइन्फेक्शन के बाद यह करें।')] },
        { label: s('Refill the booster bottle with distilled water', 'बूस्टर बॉटल में डिस्टिल्ड वॉटर भरें'), details: [s('Top up again as needed through the day.', 'दिन भर ज़रूरत के अनुसार दोबारा भरें।')] },
      ]},
      { title: s('B. Other Operatory Surfaces', 'B. ऑपरेटरी की अन्य सतहें'), tasks: [
        { label: s('Disinfect counter tops and clear all loose items into drawers', 'काउंटर टॉप साफ करें और सामान दराज़ों में रखें'), details: [s('Nothing should be left sitting on the countertop.', 'काउंटर पर कुछ भी खुला न रखें।')] },
        { label: s('Disinfect drawers, handles, operatory door, and glass/wood partition', 'दराज़, हैंडल, ऑपरेटरी दरवाज़ा और पार्टीशन डिसइन्फेक्ट करें'), details: [] },
        { label: s('Disinfect laptop/desktop, keyboard, and mouse', 'लैपटॉप/डेस्कटॉप, कीबोर्ड और माउस डिसइन्फेक्ट करें'), details: [s('Wrap keyboard in cling film after disinfecting.', 'डिसइन्फेक्ट करने के बाद कीबोर्ड को क्लिंग फिल्म से ढकें।')] },
      ]},
      { title: s('C. Dental Equipment', 'C. डेंटल इक्विपमेंट'), tasks: [
        { label: s('Disinfect RVG unit, sensor, and cable', 'RVG यूनिट, सेंसर और केबल डिसइन्फेक्ट करें'), details: [s('Cover all surfaces except the sensor itself with cling film after disinfecting.', 'सेंसर को छोड़कर बाकी सभी हिस्सों को क्लिंग फिल्म से ढकें।')] },
        { label: s('Disinfect lead apron, thyroid collar, intraoral camera/scanner', 'लेड एप्रन, थायरॉइड कॉलर, इंट्राओरल कैमरा/स्कैनर डिसइन्फेक्ट करें'), details: [s('Avoid disinfectant seepage into the camera sensor.', 'डिसइन्फेक्टेंट कैमरा सेंसर में न जाने दें।')] },
        { label: s('Disinfect instrument trolley and motorized suction (external surfaces)', 'इंस्ट्रूमेंट ट्रॉली और मोटराइज़्ड सक्शन की बाहरी सतह डिसइन्फेक्ट करें'), details: [] },
        { label: s('Set up the Aerosol Suction Device', 'एरोसोल सक्शन डिवाइस तैयार करें'), details: [s('Use for all Aerosol Generating Procedures; operate within 23 cm of the operating field.', 'सभी एरोसोल-जनरेटिंग प्रक्रियाओं में इस्तेमाल करें; काम की जगह से 23 सेमी के अंदर रखें।')] },
        { label: s('Run day-to-day articles through the UV Chamber', 'रोज़मर्रा की चीज़ों को UV चैंबर में डिसइन्फेक्ट करें'), details: [s('Napkins, cloth items, masks, tubing, telephones, and other small items.', 'नैपकिन, कपड़े, मास्क, ट्यूबिंग, टेलीफोन और अन्य छोटी चीज़ें।')] },
        { label: s('Load the Formalin Disinfection Chamber on each operatory slab', 'हर ऑपरेटरी स्लैब पर फॉर्मेलिन डिसइन्फेक्शन चैंबर तैयार करें'), details: [s('4–6 tablets — for plastics, syringes, needles, scissors, instruments, impressions, plaster models.', '4–6 टैबलेट — प्लास्टिक, सिरिंज, सुई, कैंची, इंस्ट्रूमेंट, इम्प्रेशन, प्लास्टर मॉडल के लिए।')] },
      ]},
    ],
  },
  {
    id: 'waiting_billing',
    title: s('2.2 Waiting & Billing Area Preparedness', '2.2 वेटिंग और बिलिंग एरिया की तैयारी'),
    ownerRole: 'front_desk_receptionist', contingencyRole: 'house_keeping',
    groups: [{ title: null, tasks: [
      { label: s('Disinfect all touch points in the waiting/billing area', 'वेटिंग/बिलिंग एरिया के सभी टच पॉइंट डिसइन्फेक्ट करें'), details: [
        s('Side table & flower pot, table and counter surfaces, coffee machine, sofas/chairs', 'साइड टेबल, फूलदान, टेबल-काउंटर सतहें, कॉफी मशीन, सोफे/कुर्सियां'),
        s('Main entry door & handle, TV/AC/fridge & remote controls', 'मुख्य दरवाज़ा और हैंडल, TV/AC/फ्रिज और रिमोट'),
        s('Printer, card machine, landline phone, cabinets/drawers & handles', 'प्रिंटर, कार्ड मशीन, लैंडलाइन फोन, कैबिनेट/दराज़ और हैंडल'),
      ]},
      { label: s('Stock disposable water bottles for the day', 'दिन भर के लिए डिस्पोज़ेबल पानी की बोतलें रखें'), details: [] },
      { label: s('Set up the shoe-cover station', 'शू-कवर स्टेशन तैयार करें'), details: [s('Labelled "Used" bin, lidded and foot-control preferred; dispenser loaded with sufficient covers.', '"Used" लिखा हुआ ढक्कनदार डिब्बा (फुट-कंट्रोल हो तो बेहतर); डिस्पेंसर में पर्याप्त कवर भरे हों।')] },
      { label: s('Pre-stock printer paper and new registration forms for the day', 'प्रिंटर पेपर और नए रजिस्ट्रेशन फॉर्म पहले से रखें'), details: [] },
      { label: s('File old registration/consent forms', 'पुराने रजिस्ट्रेशन/सहमति फॉर्म फाइल करें'), details: [s('Use the UV Chamber to disinfect forms first if needed.', 'ज़रूरत हो तो फॉर्म को पहले UV चैंबर में डिसइन्फेक्ट करें।')] },
      { label: s('Test DVR, fire safety alarm/cylinder, and DVD player', 'DVR, फायर अलार्म/सिलेंडर और DVD प्लेयर जांचें'), details: [] },
      { label: s('Run personal belongings through the UV cabinet', 'निजी सामान UV कैबिनेट में रखें'), details: [s('Bags, wallets, keys, phones — about 90 seconds.', 'बैग, पर्स, चाबियां, फोन — लगभग 90 सेकंड।')] },
    ]}],
  },
  {
    id: 'pantry',
    title: s('2.3 Pantry Room Preparedness', '2.3 पैंट्री रूम की तैयारी'),
    ownerRole: 'front_desk_receptionist', contingencyRole: 'house_keeping',
    groups: [{ title: null, tasks: [
      { label: s('Disinfect counter tops, refrigerator, and stove', 'काउंटर टॉप, फ्रिज और स्टोव डिसइन्फेक्ट करें'), details: [] },
      { label: s('Discard cleaning waste in the Black Waste Bin', 'सफाई का कचरा ब्लैक वेस्ट बिन में डालें'), details: [s('Closed lid, foot-operated.', 'ढक्कन बंद, फुट-ऑपरेटेड।')] },
    ]}],
  },
  {
    id: 'washroom',
    title: s('2.4 Washroom Preparedness', '2.4 वॉशरूम की तैयारी'),
    ownerRole: 'front_desk_receptionist', contingencyRole: 'house_keeping',
    groups: [{ title: null, tasks: [
      { label: s('Disinfect washbasin, taps, jet spray, door and handle', 'वॉशबेसिन, नल, जेट स्प्रे, दरवाज़ा और हैंडल डिसइन्फेक्ट करें'), details: [] },
      { label: s('Refill soap dispenser and tissue paper', 'साबुन डिस्पेंसर और टिशू पेपर भरें'), details: [] },
    ]}],
  },
  {
    id: 'equipment_check',
    title: s('3. Equipment Readiness Check', '3. उपकरण जांच'),
    subtitle: s('Before first patient', 'पहले मरीज़ से पहले'),
    ownerRole: 'lead_dental_assistant', contingencyRole: 'sterilization_technician',
    groups: [{ title: null, tasks: [
      { label: s('Switch on and test all clinical equipment', 'सभी क्लिनिकल उपकरण चालू करें और जांचें'), details: [
        s('Dental chair — all movements (back, up/down, headrest)', 'डेंटल चेयर — सभी मूवमेंट (पीछे, ऊपर-नीचे, हेडरेस्ट)'),
        s('Dental light — bulb functionality', 'डेंटल लाइट — बल्ब सही काम कर रहा हो'),
        s('Compressor — 5 min warm-up, check pressure gauge', 'कंप्रेसर — 5 मिनट वार्म-अप, प्रेशर गेज जांचें'),
        s('Suction unit — test strength; Ultrasonic scaler — test activation', 'सक्शन यूनिट — ताकत जांचें; अल्ट्रासोनिक स्केलर — चालू करके जांचें'),
        s('RVG/X-ray unit — power and connectivity; Intraoral camera — image capture', 'RVG/X-ray यूनिट — पावर और कनेक्टिविटी; इंट्राओरल कैमरा — इमेज कैप्चर'),
        s('Autoclave — water level and heating; Ultrasonic cleaner — solution level', 'ऑटोक्लेव — पानी का स्तर और हीटिंग; अल्ट्रासोनिक क्लीनर — सॉल्यूशन स्तर'),
        s('UV cabinets — confirm UV light activation', 'UV कैबिनेट — UV लाइट चालू होना जांचें'),
      ]},
      { label: s('Log any equipment fault and notify the Clinic Manager', 'कोई भी उपकरण खराबी दर्ज करें और क्लिनिक मैनेजर को बताएं'), details: [s('Use the Equipment Fault Register.', 'इक्विपमेंट फॉल्ट रजिस्टर में दर्ज करें।')] },
      { label: s('Confirm backup instruments are available', 'बैकअप इंस्ट्रूमेंट उपलब्ध होने की पुष्टि करें'), details: [s('For all critical procedure equipment.', 'सभी ज़रूरी प्रक्रिया के उपकरणों के लिए।')] },
    ]}],
  },
  {
    id: 'inventory_check',
    title: s('4. Inventory Readiness Verification', '4. इन्वेंटरी जांच'),
    subtitle: s('Before first patient', 'पहले मरीज़ से पहले'),
    ownerRole: 'lead_dental_assistant', contingencyRole: 'sterilization_technician',
    groups: [{ title: null, tasks: [
      { label: s('Verify stock availability for the day', 'दिन भर के लिए स्टॉक की उपलब्धता जांचें'), details: [
        s('Disposable gloves (examination and surgical); 3-layered surgical and N95 masks', 'डिस्पोज़ेबल ग्लव्स (एग्ज़ामिनेशन और सर्जिकल); 3-लेयर सर्जिकल और N95 मास्क'),
        s('Disposable head caps; cling film roll; patient drapes/bibs', 'हेड कैप; क्लिंग फिल्म रोल; पेशेंट ड्रेप/बिब'),
        s('Cotton, gauze, and dressing packs; anaesthetic cartridges and needles', 'कॉटन, गॉज़, ड्रेसिंग पैक; एनेस्थीसिया कार्ट्रिज और सुई'),
        s('Suction tips and saliva ejectors; sterilization pouches', 'सक्शन टिप्स, सलाइवा इजेक्टर; स्टरलाइज़ेशन पाउच'),
        s('Autoclave distilled water; alcohol-based disinfectant and hand sanitizer', 'ऑटोक्लेव डिस्टिल्ड वॉटर; अल्कोहल-आधारित डिसइन्फेक्टेंट और सैनिटाइज़र'),
      ]},
      { label: s('Raise a Purchase Request for anything at or below minimum threshold', 'न्यूनतम स्तर से कम किसी भी चीज़ के लिए परचेज़ रिक्वेस्ट भेजें'), details: [s('Send to the Clinic Manager immediately.', 'तुरंत क्लिनिक मैनेजर को भेजें।')] },
      { label: s('Confirm sterilized instrument packs are sufficient for the day', 'दिन भर के लिए स्टरलाइज़्ड इंस्ट्रूमेंट पैक पर्याप्त होने की पुष्टि करें'), details: [s('Check quantities in the UV Cabinets against the day\u2019s appointments.', 'UV कैबिनेट में मौजूद मात्रा को दिन की अपॉइंटमेंट से मिलाकर देखें।')] },
    ]}],
  },
  {
    id: 'morning_huddle',
    title: s('Daily Morning Huddle Protocol', 'रोज़ाना मॉर्निंग हडल'),
    subtitle: s('10–15 minutes before first patient, facilitated by the Clinic Manager', 'पहले मरीज़ से 10–15 मिनट पहले, क्लिनिक मैनेजर द्वारा संचालित'),
    ownerRole: 'clinic_manager', contingencyRole: null,
    groups: [{ title: null, tasks: [
      { label: s('Hold the morning huddle', 'मॉर्निंग हडल करें'), details: [
        s('Review the day\u2019s appointment schedule', 'दिन की अपॉइंटमेंट शेड्यूल देखें'),
        s('Highlight special patients (anxious patients, medical alerts, VIPs)', 'खास मरीज़ों की जानकारी दें (चिंतित मरीज़, मेडिकल अलर्ट, VIP)'),
        s('Cover equipment/inventory issues from the previous day', 'पिछले दिन की उपकरण/इन्वेंटरी समस्याएं बताएं'),
        s('Share operational updates or policy reminders', 'ऑपरेशनल अपडेट या नियमों की याद दिलाएं'),
        s('Recognize the previous day\u2019s achievements', 'पिछले दिन की उपलब्धियों की सराहना करें'),
        s('Doctor contributes clinical notes', 'डॉक्टर क्लिनिकल जानकारी दें'),
      ]},
      { label: s('Assign action items with a clear owner and deadline', 'हर काम की ज़िम्मेदारी और समय-सीमा तय करें'), details: [] },
      { label: s('Hold the weekly team meeting', 'साप्ताहिक टीम मीटिंग करें'), details: [s('15–20 min, end of week — review the week, plan next week, address recurring issues.', '15–20 मिनट, हफ्ते के अंत में — हफ्ते की समीक्षा करें, अगले हफ्ते की योजना बनाएं।')] },
    ]}],
  },
  {
    id: 'ppe',
    title: s('PPE for Dental Assistants', 'डेंटल असिस्टेंट के लिए PPE'),
    ownerRole: 'sterilization_technician', contingencyRole: 'lead_dental_assistant',
    groups: [{ title: null, tasks: [
      { label: s('Gloves — correct use confirmed', 'ग्लव्स — सही इस्तेमाल की पुष्टि'), details: [
        s('Hands sanitized and dried before donning; gloving does not replace hand washing', 'पहनने से पहले हाथ सैनिटाइज़ और सुखाए गए हों; ग्लव्स हाथ धोने का विकल्प नहीं है'),
        s('Examination gloves for routine work; double-glove for surgical/aerosol-generating procedures', 'रूटीन काम के लिए एग्ज़ामिनेशन ग्लव्स; सर्जिकल/एरोसोल प्रक्रिया में डबल ग्लव'),
        s('New pair per patient; change if compromised or grossly contaminated', 'हर मरीज़ के लिए नए ग्लव्स; खराब या गंदे होने पर बदलें'),
      ]},
      { label: s('Face masks — correct use confirmed', 'फेस मास्क — सही इस्तेमाल की पुष्टि'), details: [s('Single 3-layered mask for routine work; double 3-layered mask for Aerosol Generating Procedures.', 'रूटीन काम में एक 3-लेयर मास्क; एरोसोल प्रक्रिया में दो 3-लेयर मास्क।')] },
      { label: s('Protective eyewear — correct use confirmed', 'प्रोटेक्टिव आईवेयर — सही इस्तेमाल की पुष्टि'), details: [s('Worn whenever splash/spray or aerosol risk exists; disinfected after every use by washing with soap & water and UV-chamber sanitizing (never spirit).', 'छींटे या एरोसोल का खतरा हो तो पहनें; हर बार साबुन-पानी से धोकर और UV चैंबर में सैनिटाइज़ करें (स्पिरिट कभी न लगाएं)।')] },
      { label: s('Gowns/coveralls — correct use confirmed', 'गाउन/कवरऑल — सही इस्तेमाल की पुष्टि'), details: [s('Surgical gown over uniform for AGPs; disposable plastic sleeve, single use, for non-AGP work.', 'एरोसोल प्रक्रिया में यूनिफॉर्म के ऊपर सर्जिकल गाउन; बाकी काम में डिस्पोज़ेबल प्लास्टिक स्लीव, एक बार इस्तेमाल।')] },
      { label: s('Disposable caps — worn by all Dental Assistants for every patient', 'डिस्पोज़ेबल कैप — हर डेंटल असिस्टेंट हर मरीज़ के लिए पहनें'), details: [s('Must fully cover the hair.', 'बाल पूरी तरह ढके होने चाहिए।')] },
    ]}],
  },
  {
    id: 'sterilization_room',
    title: s('Sterilization Room — K.B. Dental Five-Step Protocol', 'स्टरलाइज़ेशन रूम — K.B. Dental पांच-चरण प्रोटोकॉल'),
    subtitle: s('Follow completely each morning before patient arrival and after each patient use', 'हर सुबह मरीज़ आने से पहले और हर मरीज़ के बाद पूरी तरह अपनाएं'),
    ownerRole: 'sterilization_technician', contingencyRole: 'lead_dental_assistant',
    groups: [{ title: null, tasks: [
      { label: s('Step 1 — PPE and hand hygiene before handling instruments', 'चरण 1 — इंस्ट्रूमेंट छूने से पहले PPE और हाथ की सफाई'), details: [
        s('Wear disposable gown, face mask, and household gloves for manual cleaning', 'मैनुअल सफाई के लिए डिस्पोज़ेबल गाउन, मास्क और हाउसहोल्ड ग्लव्स पहनें'),
        s('Wash and sanitize hands, then wear heavy-duty gloves before touching instruments', 'हाथ धोएं-सैनिटाइज़ करें, फिर इंस्ट्रूमेंट छूने से पहले हैवी-ड्यूटी ग्लव्स पहनें'),
      ]},
      { label: s('Step 2 — Pre-clean and rinse', 'चरण 2 — पहले सफाई और धुलाई'), details: [
        s('Rinse all instruments under running water first', 'पहले सभी इंस्ट्रूमेंट को बहते पानी में धोएं'),
        s('Prepare a non-foaming, neutral (pH 5–9) detergent solution — never washing liquid', 'बिना झाग वाला, न्यूट्रल (pH 5–9) डिटर्जेंट सॉल्यूशन बनाएं — वॉशिंग लिक्विड कभी नहीं'),
        s('Use a nylon brush only, never green pads or wire brushes', 'सिर्फ नायलॉन ब्रश इस्तेमाल करें, हरे पैड या तार ब्रश कभी नहीं'),
        s('Fully immerse in lukewarm water (<35°C), wash by hand without scrubbing, disassemble multi-part tools, final rinse under warm water', 'हल्के गर्म पानी (<35°C) में पूरी तरह डुबोएं, हाथ से धोएं (रगड़ें नहीं), पार्ट्स अलग करें, गर्म पानी से आख़िरी धुलाई करें'),
        s('Dry to avoid carrying over polluted wash water', 'गंदा पानी आगे न ले जाए इसलिए सुखाएं'),
      ]},
      { label: s('Step 3 — Soak and scrub', 'चरण 3 — भिगोना और रगड़ना'), details: [
        s('Soak in the prepared detergent solution for 15 minutes, then scrub all instruments', 'तैयार डिटर्जेंट सॉल्यूशन में 15 मिनट भिगोएं, फिर सभी इंस्ट्रूमेंट रगड़ें'),
        s('Rinse thoroughly under running water', 'बहते पानी में अच्छी तरह धोएं'),
        s('Inspect handles, tips, and drills under a magnifying light; dry', 'मैग्निफाइंग लाइट में हैंडल, टिप और ड्रिल जांचें; सुखाएं'),
      ]},
      { label: s('Step 4 — Ultrasonic clean', 'चरण 4 — अल्ट्रासोनिक क्लीनिंग'), details: [
        s('Submerge in the Ultrasonic Cleaner for 5–10 minutes (950 ml distilled water + 50 ml disinfectant, e.g. Korsolex)', 'अल्ट्रासोनिक क्लीनर में 5–10 मिनट डुबोएं (950 मिली डिस्टिल्ड वॉटर + 50 मिली डिसइन्फेक्टेंट, जैसे Korsolex)'),
        s('Rinse thoroughly with warm distilled water afterward', 'बाद में गर्म डिस्टिल्ड वॉटर से अच्छी तरह धोएं'),
        s('Inspect, hand-scrub again if needed, and dry with a clean towel/cloth', 'जांचें, ज़रूरत हो तो दोबारा रगड़ें, साफ तौलिये से सुखाएं'),
      ]},
      { label: s('Step 5 — Package and autoclave', 'चरण 5 — पैकिंग और ऑटोक्लेव'), details: [
        s('Pack in sterilization pouches, seal fully, and mark the date with staff initials — this completes decontamination', 'स्टरलाइज़ेशन पाउच में पैक करें, पूरी तरह सील करें, तारीख और स्टाफ के इनिशियल लिखें — यहां डीकंटेमिनेशन पूरा होता है'),
        s('Autoclave at 121–131°C for complete sterilization including spore elimination', '121–131°C पर ऑटोक्लेव करें ताकि स्पोर सहित पूरी स्टरलाइज़ेशन हो'),
        s('Remove with gloved hands using Cheatle forceps; store in the correct UV Cabinet/drawer', 'ग्लव्स पहनकर Cheatle फोर्सेप्स से निकालें; सही UV कैबिनेट/दराज़ में रखें'),
        s('Storage must be dust-proof, dry, not crushed or bent, with oldest-sterilized-first rotation', 'स्टोरेज धूल-मुक्त, सूखी हो; सामान दबे या मुड़े नहीं; पहले स्टरलाइज़ किया सामान पहले इस्तेमाल करें'),
      ]},
      { label: s('Disinfect the sterilization room itself', 'स्टरलाइज़ेशन रूम को खुद डिसइन्फेक्ट करें'), details: [
        s('Counter tops; autoclave, ultrasonic cleaner, sealing machine, water distiller, needle cutter', 'काउंटर टॉप; ऑटोक्लेव, अल्ट्रासोनिक क्लीनर, सीलिंग मशीन, वॉटर डिस्टिलर, नीडल कटर'),
        s('All cabinets (including UV cabinets), drawers and handles, glass door and handle', 'सभी कैबिनेट (UV कैबिनेट सहित), दराज़ और हैंडल, कांच का दरवाज़ा और हैंडल'),
      ]},
    ]}],
    note: s('Common failure points: skipping prep steps before decontamination, improper packaging/loading/positioning of instruments, not timing cycles correctly, and disorganized workflow.', 'आम गलतियां: डीकंटेमिनेशन से पहले की तैयारी छोड़ना, इंस्ट्रूमेंट सही तरीके से न पैक/रखना, साइकल का समय सही न रखना, और काम में क्रम न होना।'),
  },
  {
    id: 'utilities',
    title: s('Utilities & Energy', 'बिजली, पानी और सुविधाएं'),
    subtitle: s('Checked through the day, not only at opening', 'सिर्फ सुबह नहीं — दिन भर देखें'),
    ownerRole: 'house_keeping', contingencyRole: 'front_desk_receptionist',
    groups: [{ title: null, tasks: [
      { label: s('Air conditioning set to 24°C in rooms in use', 'इस्तेमाल हो रहे कमरों में AC 24°C पर है'), details: [
        s('Switch the AC off in any room that is empty.', 'जो कमरा खाली है, उसका AC बंद कर दें।'),
      ]},
      { label: s('Lights, fans and equipment off in empty rooms', 'खाली कमरों की लाइट, पंखे और उपकरण बंद हैं'), details: [
        s('Check between patients, not only at closing time.', 'सिर्फ बंद करते समय नहीं — मरीज़ों के बीच में भी देखें।'),
      ]},
      { label: s('Plants watered', 'पौधों को पानी दिया'), details: [] },
      { label: s('Water pump checked and switched off once the tank is full', 'वॉटर पंप देखा और टंकी भरने पर बंद किया'), details: [
        s('Leaving the pump running overflows the tank and wastes water.', 'पंप चलता छोड़ने से टंकी बहती है और पानी बर्बाद होता है।'),
      ]},
      { label: s('Air diffuser switched on and off at the set times', 'एयर डिफ्यूज़र तय समय पर चालू और बंद किया'), details: [] },
    ]}],
  },
  {
    id: 'fixtures',
    title: s('Fixtures & Repairs', 'फिटिंग और मरम्मत'),
    subtitle: s('A quick look each day, so small faults are caught early', 'रोज़ एक नज़र, ताकि छोटी खराबी समय पर पकड़ी जाए'),
    ownerRole: 'clinic_manager', contingencyRole: 'house_keeping',
    groups: [{ title: null, tasks: [
      { label: s('Doors, handles and hinges working', 'दरवाज़े, हैंडल और कब्ज़े ठीक चल रहे हैं'), details: [] },
      { label: s('Washbasins, taps and jet sprays — no leaks', 'वॉशबेसिन, नल और जेट स्प्रे — कोई लीक नहीं'), details: [] },
      { label: s('Electrical switches and extension boards safe', 'बिजली के स्विच और एक्सटेंशन बोर्ड सुरक्षित हैं'), details: [
        s('Look for loose sockets, exposed wiring or scorch marks.', 'ढीले सॉकेट, खुली तार या जलने के निशान देखें।'),
      ]},
      { label: s('Chairs, cabinets, file boxes and furniture intact', 'चेयर, कैबिनेट, फाइल बॉक्स और फर्नीचर सही हालत में हैं'), details: [] },
      { label: s('Anything needing plumbing, electrical or repair work reported', 'प्लंबिंग, बिजली या मरम्मत की ज़रूरत बता दी गई है'), details: [
        s('Tell the Clinic Manager the same day — do not wait for it to get worse.', 'उसी दिन क्लिनिक मैनेजर को बताएं — बिगड़ने का इंतज़ार न करें।'),
      ]},
    ]}],
  },
  {
    id: 'floor_cleaning',
    title: s('Floor Cleaning — 3-Bucket Technique', 'फ्लोर क्लीनिंग — 3-बकेट तकनीक'),
    ownerRole: 'sterilization_technician', contingencyRole: 'lead_dental_assistant',
    groups: [{ title: null, tasks: [
      { label: s('Mop the clinic using the 3-Bucket Technique', '3-बकेट तकनीक से क्लिनिक पोंछें'), details: [
        s('Three buckets: plain water, cleaning solution (detergent + warm water), and Virulex', 'तीन बाल्टियां: सादा पानी, क्लीनिंग सॉल्यूशन (डिटर्जेंट + गर्म पानी), और Virulex'),
        s('Mop with cleaning solution first, rinse mop in plain water and squeeze, then mop again with Virulex once dry', 'पहले क्लीनिंग सॉल्यूशन से पोंछें, पोंछा सादा पानी में धोकर निचोड़ें, फिर सूखने पर Virulex से दोबारा पोंछें'),
        s('Mop from the far corner of the room toward the door', 'कमरे के दूर कोने से दरवाज़े की तरफ पोंछें'),
        s('Avoid broom sweeping — it increases aerosol transmission', 'झाड़ू से बुहारना नहीं — इससे एरोसोल फैलता है'),
        s('Operatory: after every patient and once in the morning. Common areas & reception: at least twice daily (reception uses 1% sodium hypochlorite)', 'ऑपरेटरी: हर मरीज़ के बाद और सुबह एक बार। बाकी जगह और रिसेप्शन: दिन में कम से कम दो बार (रिसेप्शन में 1% सोडियम हाइपोक्लोराइट इस्तेमाल करें)'),
      ]},
      { label: s('Clean and dry the mop after use', 'इस्तेमाल के बाद पोंछे को साफ करके सुखाएं'), details: [s('Hot water and detergent, disinfect with Virulex, store hanging upside-down.', 'गर्म पानी और डिटर्जेंट से धोएं, Virulex से डिसइन्फेक्ट करें, उल्टा लटकाकर रखें।')] },
    ]}],
  },
  {
    id: 'fumigation',
    title: s('Fumigation Protocol', 'फ्यूमिगेशन प्रोटोकॉल'),
    ownerRole: 'sterilization_technician', contingencyRole: 'lead_dental_assistant',
    groups: [{ title: null, tasks: [
      { label: s('Fumigate the clinic', 'क्लिनिक को फ्यूमिगेट करें'), details: [
        s('Once daily, on a holiday or at end of day; keep the room closed for at least one hour after', 'रोज़ एक बार, छुट्टी के दिन या दिन के अंत में; उसके बाद कमरा कम से कम एक घंटे बंद रखें'),
        s('Use Germishield agent (Virex II): 50 ml concentrated solution in 950 ml water per 2–3 surgery clinic', 'Germishield एजेंट (Virex II) इस्तेमाल करें: 2–3 सर्जरी क्लिनिक के लिए 950 मिली पानी में 50 मिली सॉल्यूशन'),
        s('Alternative: 10% formaldehyde (5–10 ml) with potassium permanganate powder', 'विकल्प: 10% फॉर्मेलिन (5–10 मिली) पोटैशियम परमैंगनेट पाउडर के साथ'),
      ]},
    ]}],
  },
  {
    id: 'biomedical_waste',
    title: s('Bio-Medical Waste Management', 'बायो-मेडिकल वेस्ट प्रबंधन'),
    ownerRole: 'sterilization_technician', contingencyRole: 'lead_dental_assistant',
    groups: [{ title: null, tasks: [
      { label: s('Segregate waste correctly at the point of generation', 'कचरे को बनते ही सही तरीके से अलग करें'), details: [
        s('Yellow (contaminated non-plastics): extracted teeth & tissues, contaminated cotton/gauze/linen/paper, discarded medicines', 'पीला (गैर-प्लास्टिक): निकाले गए दांत, टिशू, गंदे कॉटन/गॉज़/कपड़े/कागज़, बची हुई दवाइयां'),
        s('Red (contaminated plastics): gloves, masks, gowns, eye shields, suction tips, syringes, IV sets', 'लाल (प्लास्टिक): ग्लव्स, मास्क, गाउन, आई शील्ड, सक्शन टिप्स, सिरिंज, IV सेट'),
        s('Blue sharps (broken/discarded glass): vials, ampules, slides & coverslips, implants', 'नीला शार्प्स (टूटा कांच): वायल, एम्पुल, स्लाइड, इम्प्लांट'),
        s('White sharps (broken/discarded metals): needles, blades, wires, arch bars, bands, brackets, burs, endodontic instruments, cast posts/crowns', 'सफेद शार्प्स (धातु): सुई, ब्लेड, तार, आर्च बार, बैंड, ब्रैकेट, बर, एंडो इंस्ट्रूमेंट, कास्ट पोस्ट/क्राउन'),
        s('Black bin: dental impressions, casts, acrylic prosthesis without clasp', 'काला बिन: डेंटल इम्प्रेशन, कास्ट, बिना क्लास्प का एक्रिलिक प्रोस्थेसिस'),
      ]},
      { label: s('Confirm bins meet spec and daily pickup is happening', 'बिन सही मानक के हों और रोज़ उठाए जा रहे हों — पुष्टि करें'), details: [s('Puncture-proof, lidded, foot-operated, bio-hazard symbol; non-chlorinated labelled liners; escalate to Clinic Manager if the BMW vendor misses a pickup.', 'पंचर-प्रूफ, ढक्कनदार, फुट-ऑपरेटेड, बायो-हैज़र्ड चिन्ह; बिना क्लोरीन वाले लेबल किए लाइनर; BMW वेंडर न आए तो क्लिनिक मैनेजर को बताएं।')] },
      { label: s('Pre-treat infectious waste before disposal', 'संक्रामक कचरे को फेंकने से पहले उपचारित करें'), details: [s('Immerse in freshly prepared 1% sodium hypochlorite for 15–20 minutes.', 'ताज़ा तैयार 1% सोडियम हाइपोक्लोराइट में 15–20 मिनट डुबोएं।')] },
      { label: s('Follow sharps handling rules', 'शार्प्स संभालने के नियम अपनाएं'), details: [s('Always wear gloves; top up 1% sodium hypochlorite daily; seal sharps boxes at 3/4 full; never recap needles.', 'हमेशा ग्लव्स पहनें; रोज़ 1% सोडियम हाइपोक्लोराइट डालें; बॉक्स 3/4 भरने पर सील करें; सुई पर कैप कभी वापस न लगाएं।')] },
    ]}],
  },
];

// Which CLINIC sub-tab each Clinic Readiness section belongs to.
window.KuBi.CLINIC_SUBTAB_OF = {
  staff_entry: 'readiness',
  morning_huddle: 'readiness',
  operatory: 'equipment',
  equipment_check: 'equipment',
  waiting_billing: 'housekeeping',
  pantry: 'housekeeping',
  washroom: 'housekeeping',
  utilities: 'housekeeping',
  fixtures: 'housekeeping',
  floor_cleaning: 'housekeeping',
  biomedical_waste: 'housekeeping',
  inventory_check: 'inventory',
  ppe: 'sterilization',
  sterilization_room: 'sterilization',
  // Fumigation happens at end of day, so it belongs to closing.
  fumigation: 'closing',
};

window.KuBi.CLINIC_SUBTABS = ['opening', 'readiness', 'equipment', 'sterilization', 'inventory', 'housekeeping', 'closing'];

// Operatories / clinic rooms. Sections marked perRoom:true repeat once
// per room, so Clinic 1 can be ready while Clinic 3 isn't.
window.KuBi.CLINIC_ROOMS = [1, 2, 3, 4];

// Checklist key for a task. Per-room sections get the room folded into
// the key so each room tracks independently; everything else is unchanged.
window.KuBi.taskKey = function (section, groupIdx, taskIdx, room) {
  const base = section.id + '-g' + groupIdx + '-t' + taskIdx;
  return section.perRoom ? base + '-r' + room : base;
};

// Per-room completion for a perRoom section.
window.KuBi.roomStats = function (section, room, checked) {
  let total = 0, done = 0;
  section.groups.forEach(function (g, gi) {
    g.tasks.forEach(function (t, ti) {
      total++;
      if (checked[window.KuBi.taskKey(section, gi, ti, room)]) done++;
    });
  });
  return { total: total, done: done, ready: total > 0 && done === total };
};
