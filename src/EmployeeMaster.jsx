// EmployeeMaster.jsx — staff records. Each employee is assigned exactly
// one role; everything that employee can access follows from that role
// via roles.js. This file never encodes permissions itself.

window.KuBi = window.KuBi || {};

window.KuBi.EmployeeMaster = function EmployeeMaster({ lang }) {
  const { EMPLOYEES } = window.KuBi;
  const RoleBadge = window.KuBi.RoleBadge;
  const t = window.KuBi.t;

  const categories = ['Clinical', 'Administration', 'Management'];

  return (
    <div className="module">
      <div className="module-head">
        <h2>{t('employee.title', lang)}</h2>
        <p className="module-sub">{t('employee.subtitle', lang)}</p>
      </div>

      {categories.map(function (cat) {
        const rows = EMPLOYEES.filter(function (e) {
          const role = window.KuBi.getRole(e.role);
          return role && role.category === cat;
        });
        if (rows.length === 0) return null;
        return (
          <div className="card" key={cat}>
            <div className="card-title">{t('category.' + cat, lang)}</div>
            <table className="kb-table">
              <thead>
                <tr>
                  <th>{t('employee.id', lang)}</th>
                  <th>{t('employee.name', lang)}</th>
                  <th>{t('employee.role', lang)}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(function (e) {
                  return (
                    <tr key={e.id}>
                      <td className="mono">{e.id}</td>
                      <td>{e.name}</td>
                      <td><RoleBadge roleId={e.role} lang={lang} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};
