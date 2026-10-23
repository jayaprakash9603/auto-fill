/**
 * Enforces the package dependency direction documented in docs/ARCHITECTURE.md.
 * Each entry lists the internal packages a package may import; everything else is forbidden.
 */
const ALLOWED = {
  core: [],
  'field-detection': ['core'],
  'matching-engine': ['core'],
  'form-actions': ['core'],
  storage: ['core'],
  'learning-engine': ['core'],
  'synthetic-data': ['core'],
  'portal-adapters': ['core', 'field-detection', 'form-actions'],
  'autofill-sdk': [
    'core',
    'field-detection',
    'matching-engine',
    'form-actions',
    'storage',
    'learning-engine',
    'synthetic-data',
    'portal-adapters',
  ],
  'extension-bridge': ['core', 'autofill-sdk', 'storage'],
  ui: ['core', 'autofill-sdk'],
  'public-sdk': ['core', 'autofill-sdk', 'ui', 'extension-bridge', 'storage'],
}

const packageRules = Object.entries(ALLOWED).map(([name, allowed]) => {
  const permitted = [name, ...allowed].join('|')
  return {
    name: `direction-${name}`,
    comment: `${name} may only depend on: ${allowed.join(', ') || 'nothing internal'}`,
    severity: 'error',
    from: { path: `^packages/${name}/` },
    to: { path: '^packages/', pathNot: `^packages/(${permitted})/` },
  }
})

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    ...packageRules,
    {
      name: 'apps-not-from-packages',
      comment: 'Packages must never import application code.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
    {
      name: 'demo-host-uses-public-sdk-only',
      comment:
        'The demo host proves the public package is enough; it may not reach into internal packages.',
      severity: 'error',
      from: { path: '^apps/demo-host-extension/' },
      to: { path: '^packages/(?!public-sdk/)' },
    },
    {
      name: 'apps-are-isolated',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/([^/]+)/', pathNot: '^apps/$1/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '(node_modules|/dist/|\\.test\\.tsx?$)' },
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    preserveSymlinks: false,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'types', 'default'],
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.json'],
      mainFields: ['module', 'main', 'types'],
    },
  },
}
