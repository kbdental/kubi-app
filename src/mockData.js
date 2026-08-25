// mockData.js — placeholder data.
// EMPLOYEES here plays the part of the Employee Master.
// ATTENDANCE here plays the part of the Google Sheet that the
// Management app writes to. When that sheet is connected, this array
// is what gets replaced by real rows — the AttendanceModule component
// doesn't need to change at all.

window.KuBi = window.KuBi || {};

// The clinic's current operating date, as YYYY-MM-DD in local time.
// Everything that filters "today" must use this — never a literal date.
// (Using toISOString() here would be wrong: it converts to UTC and would
// roll the date over during evening hours in IST.)
window.KuBi.operatingDate = function (d) {
  const dt = d ? new Date(d) : new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
};

// Attendance for a given date (defaults to today).
window.KuBi.attendanceFor = function (dateStr) {
  const target = dateStr || window.KuBi.operatingDate();
  return (window.KuBi.ATTENDANCE || []).filter(function (r) { return r.date === target; });
};

// Present / Late / Absent counts for a given date (defaults to today).
window.KuBi.attendanceCounts = function (dateStr) {
  const counts = { Present: 0, Late: 0, Absent: 0 };
  window.KuBi.attendanceFor(dateStr).forEach(function (r) {
    if (counts[r.status] !== undefined) counts[r.status]++;
  });
  return counts;
};

window.KuBi.EMPLOYEES = [
  { id: 'E01', name: 'Dr. Ananya Rao',    role: 'lead_dentist',              pin: '1111' },
  { id: 'E02', name: 'Dr. Karan Mehta',   role: 'associate_dentist',         pin: '1112' },
  { id: 'E03', name: 'Priya Sharma',      role: 'lead_dental_assistant',     pin: '1113' },
  { id: 'E04', name: 'Suresh Kumar',      role: 'sterilization_technician',  pin: '1114' },
  { id: 'E05', name: 'Nisha Verma',       role: 'front_desk_receptionist',   pin: '1115' },
  { id: 'E06', name: 'Ramesh Yadav',      role: 'house_keeping',             pin: '1116' },
  { id: 'E07', name: 'Aakash Jain',       role: 'mis',                       pin: '1117' },
  { id: 'E09', name: 'Kiran Bose',        role: 'clinic_manager',            pin: '1118' },
  { id: 'E08', name: 'Viveyk',            role: 'owner_admin',               pin: '0000' },
];

// status: 'Present' | 'Late' | 'Absent'
// lateReason is only meaningful when status === 'Late'
// Dates are generated relative to today so the mock data stays current
// whenever the app is opened — a real feed would supply real dates.
var _today = window.KuBi.operatingDate();
var _yest = window.KuBi.operatingDate(new Date(Date.now() - 86400000));
window.KuBi.ATTENDANCE = [
  { empId: 'E01', date: _today, timeIn: '08:58', status: 'Present', lateReason: '' },
  { empId: 'E02', date: _today, timeIn: '09:22', status: 'Late',    lateReason: 'Traffic — DND Flyway closure' },
  { empId: 'E03', date: _today, timeIn: '08:55', status: 'Present', lateReason: '' },
  { empId: 'E04', date: _today, timeIn: '',      status: 'Absent',  lateReason: '' },
  { empId: 'E05', date: _today, timeIn: '09:05', status: 'Late',    lateReason: 'Personal — reported to Owner/Admin' },
  { empId: 'E06', date: _today, timeIn: '08:40', status: 'Present', lateReason: '' },
  { empId: 'E07', date: _today, timeIn: '09:00', status: 'Present', lateReason: '' },
  { empId: 'E08', date: _today, timeIn: '08:30', status: 'Present', lateReason: '' },

  { empId: 'E01', date: _yest, timeIn: '08:57', status: 'Present', lateReason: '' },
  { empId: 'E02', date: _yest, timeIn: '08:59', status: 'Present', lateReason: '' },
  { empId: 'E03', date: _yest, timeIn: '09:15', status: 'Late',    lateReason: 'Metro delay' },
  { empId: 'E04', date: _yest, timeIn: '08:50', status: 'Present', lateReason: '' },
  { empId: 'E05', date: _yest, timeIn: '08:58', status: 'Present', lateReason: '' },
  { empId: 'E06', date: _yest, timeIn: '08:41', status: 'Present', lateReason: '' },
  { empId: 'E07', date: _yest, timeIn: '',      status: 'Absent',  lateReason: '' },
  { empId: 'E08', date: _yest, timeIn: '08:32', status: 'Present', lateReason: '' },
];

// Stand-in for "we last pulled from the Google Sheet at this time".
window.KuBi.ATTENDANCE_LAST_SYNCED = new Date(new Date().setHours(9, 31, 0, 0));
