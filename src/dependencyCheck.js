const MODULE_ID = 'abf-animations';
const JB2A_IDS = ['JB2A_DnD5e', 'jb2a_patreon'];

/** Follow required packages, including requirements of installed disabled packages. */
export function collectDependencyReport({
  modules = game.modules,
  system = game.system,
  isNewerVersion = foundry.utils.isNewerVersion
} = {}) {
  const rows = new Map();
  const visited = new Set();

  function visit(requirement, parent) {
    const { id, type = 'module', compatibility = {} } = requirement;
    const key = `${type}:${id}`;
    const pkg = type === 'system' ? (system?.id === id ? system : null) : modules.get(id);
    let row = rows.get(key);
    if (!row) {
      row = {
        id,
        title: pkg?.title || id,
        version: pkg?.version,
        requiredBy: new Set(),
        issues: new Set()
      };
      rows.set(key, row);
    }
    row.requiredBy.add(parent);
    if (!pkg) row.issues.add('Missing');
    else {
      if (type === 'module' && !pkg.active) row.issues.add('Disabled');
      if (
        compatibility.minimum &&
        (!pkg.version || isNewerVersion(compatibility.minimum, pkg.version))
      ) {
        row.issues.add(`Requires version ${compatibility.minimum} or newer`);
      }
      if (
        compatibility.maximum &&
        (!pkg.version || isNewerVersion(pkg.version, compatibility.maximum))
      ) {
        row.issues.add(`Requires version ${compatibility.maximum} or older`);
      }
    }
    // Check each incoming version constraint, but traverse each package only once.
    if (!pkg || visited.has(key)) return;
    visited.add(key);
    for (const dependency of pkg.relationships?.requires ?? [])
      visit(dependency, row.title);
    const systems = Array.from(pkg.relationships?.systems ?? []);
    if (systems.length) {
      const supported = systems.find(entry => entry.id === system?.id);
      if (supported) visit({ ...supported, type: 'system' }, row.title);
      else
        row.issues.add(`Requires system: ${systems.map(entry => entry.id).join(' or ')}`);
    }
  }

  visit({ id: MODULE_ID }, 'Current world');
  // JB2A is an either/or runtime requirement, so it cannot be declared in requires.
  const libraries = JB2A_IDS.map(id => modules.get(id)).filter(Boolean);
  const usable = pkg =>
    pkg.id === 'jb2a_patreon' || (pkg.version && !isNewerVersion('0.7.4', pkg.version));
  const library =
    libraries.find(pkg => pkg.active && usable(pkg)) ??
    libraries.find(pkg => pkg.active) ??
    libraries.find(usable) ??
    libraries[0];
  if (library) {
    visit(
      {
        id: library.id,
        compatibility: library.id === 'JB2A_DnD5e' ? { minimum: '0.7.4' } : {}
      },
      'ABF Animations (either JB2A library)'
    );
  } else {
    rows.set('jb2a', {
      id: 'JB2A_DnD5e / jb2a_patreon',
      title: 'JB2A Free or Patreon',
      requiredBy: new Set(['ABF Animations']),
      issues: new Set(['Missing'])
    });
  }
  return Array.from(rows.values(), row => ({
    ...row,
    requiredBy: [...row.requiredBy],
    issues: [...row.issues]
  }));
}

const escapeHTML = value =>
  String(value ?? '').replace(
    /[&<>"']/g,
    char =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      })[char]
  );

export function dependencyReportHTML(rows) {
  const problems = rows.filter(row => row.issues.length).length;
  const summary = problems
    ? `${problems} required package(s) need attention.`
    : 'All required packages are installed, enabled and meet their required versions.';
  return `<p>${summary}</p>
    <div style="max-height: 50vh; overflow: auto;">
      <table><thead><tr><th>Package</th><th>Version</th><th>Status</th><th>Required by</th></tr></thead>
        <tbody>${rows
          .map(
            row => `<tr>
          <td><strong>${escapeHTML(row.title)}</strong><br><small>${escapeHTML(row.id)}</small></td>
          <td>${escapeHTML(row.version || '—')}</td>
          <td>${escapeHTML(row.issues.join('; ') || 'Ready')}</td>
          <td>${escapeHTML(row.requiredBy.join(', '))}</td>
        </tr>`
          )
          .join('')}</tbody>
      </table>
    </div>
    <p>Enable disabled modules in Manage Modules, install missing packages in Setup,
    then reload the world and run this check again.</p>
    <p>JB2A Free requires 0.7.4 or newer for all configured animation fallbacks.
    An active Patreon library can also satisfy the JB2A requirement.</p>`;
}

export function registerDependencyCheck() {
  class DependencyCheck extends foundry.applications.api.DialogV2 {
    constructor(options = {}) {
      super({
        ...options,
        window: { title: 'ABF Animations — Dependency check', resizable: true },
        position: { width: 760 },
        content: dependencyReportHTML(collectDependencyReport()),
        buttons: [{ action: 'close', label: 'Close', default: true }]
      });
    }
  }
  game.settings.registerMenu(MODULE_ID, 'checkDependencies', {
    name: 'Dependencies',
    label: 'Check dependencies',
    hint: 'Check required packages and their dependencies for missing, disabled or incompatible versions.',
    icon: 'fa-solid fa-list-check',
    type: DependencyCheck,
    restricted: false
  });
}
