// roles.js — KuBi role-based access model.
// This file is the single source of truth for: what roles exist, what
// category each role belongs to, and which modules each role can open.
// Add a new employee anywhere in the app and assign them one of these
// roles — you never touch permission logic again.

window.KuBi = window.KuBi || {};

window.KuBi.ROLES = [
  { id: 'lead_dental_assistant',    name: 'Lead Dental Assistant',    name_hi: 'प्रमुख डेंटल असिस्टेंट',      category: 'Clinical' },
  { id: 'sterilization_technician', name: 'Sterilization Technician', name_hi: 'स्टरलाइज़ेशन तकनीशियन',       category: 'Clinical' },
  { id: 'associate_dentist',        name: 'Associate Dentist',        name_hi: 'एसोसिएट डेंटिस्ट',           category: 'Clinical' },
  { id: 'lead_dentist',             name: 'Lead Dentist',             name_hi: 'प्रमुख डेंटिस्ट',            category: 'Clinical' },
  { id: 'front_desk_receptionist',  name: 'Front Desk Receptionist',  name_hi: 'फ्रंट डेस्क रिसेप्शनिस्ट',    category: 'Administration' },
  { id: 'house_keeping',            name: 'House Keeping',            name_hi: 'हाउस कीपिंग',                category: 'Administration' },
  { id: 'mis',                      name: 'MIS',                      name_hi: 'एमआईएस',                    category: 'Management' },
  { id: 'clinic_manager',           name: 'Clinic Manager',           name_hi: 'क्लिनिक मैनेजर',             category: 'Management' },
  { id: 'owner_admin',              name: 'Owner / Admin',            name_hi: 'ओनर / एडमिन',                category: 'Management' },
];

// One accent color per category. Used everywhere a role badge appears,
// so the role a person holds is always visually obvious at a glance.
window.KuBi.CATEGORY_COLORS = {
  Clinical: '#0A5FA6',
  Administration: '#4C7EA8',
  Management: '#123C67',
};

// Which top-level AREAS each role can see. Five areas total:
// today, clinic, patients, treatment, management.
window.KuBi.AREA_ACCESS = {
  owner_admin:               ['today', 'clinic', 'patients', 'treatment', 'management', 'mis'],
  lead_dentist:               ['today', 'clinic', 'patients', 'treatment', 'management', 'mis'],
  associate_dentist:          ['today', 'clinic', 'patients', 'treatment', 'management', 'mis'],
  mis:                         ['today', 'clinic', 'management', 'mis'],
  clinic_manager:              ['today', 'clinic', 'patients', 'treatment', 'management', 'mis'],
  front_desk_receptionist:    ['today', 'clinic', 'patients'],
  lead_dental_assistant:       ['today', 'clinic', 'patients', 'treatment'],
  sterilization_technician:    ['today', 'clinic', 'treatment'],
  house_keeping:                ['today', 'clinic'],
};

window.KuBi.getRole = function (roleId) {
  return window.KuBi.ROLES.find(function (r) { return r.id === roleId; });
};
