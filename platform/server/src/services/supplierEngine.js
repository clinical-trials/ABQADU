const MATERIAL_CATEGORIES = [
  'lumber',
  'sheetrock',
  'mud',
  'roofing',
  'house wrap',
  'windows/doors',
  'cabinets',
  'appliances',
  'fixtures',
  'lighting',
  'flooring',
  'panelized shell',
];

function money(value) {
  return Math.round(Number(value || 0));
}

function projectSqft(project = {}) {
  return Number(project.sqft || project.square_feet || 600);
}

function projectBidTotal(project = {}) {
  return Number(project.bid_total || project.target_customer_price || project.base_price || 185000);
}

function packageDefaults(project = {}) {
  const sqft = projectSqft(project);
  return [
    {
      id: 'lowes-pro',
      project_id: project.id,
      supplier: "Lowe's Pro Desk",
      category: 'materials package',
      scope: 'Lumber, sheetrock, mud, roofing, house wrap, appliances, fixtures, lighting, flooring, and job-site delivery coordination.',
      quoted_total: money(sqft * 83),
      lead_time: '24-48 hour Pro Desk quote target; stock items can stage by drop.',
      delivery: 'Three job-site delivery drops from the 12th Street Pro Desk.',
      status: 'Quote requested',
      next_action: 'Send model dimensions, window/door schedule, appliance list, and delivery drop plan.',
      action_label: 'Send to COGS',
    },
    {
      id: 'raks-openings',
      project_id: project.id,
      supplier: 'RAKS Building Supply',
      category: 'windows/doors',
      scope: 'Openings, doors, windows, hardware, framing supplies, and availability check.',
      quoted_total: money(sqft * 28),
      lead_time: 'Confirm 3-7 business day availability and special-order windows.',
      delivery: 'Local delivery quote required with openings package.',
      status: 'Needs outreach',
      next_action: 'Ask for Alpine or comparable window package, exterior doors, hardware, and delivery lead time.',
      action_label: 'Send to COGS',
    },
    {
      id: 'rio-grande-package',
      project_id: project.id,
      supplier: 'Rio Grande Building Company',
      category: 'building package',
      scope: 'Regional lumber, windows, doors, sheathing, wrap, roofing, and dry-in package.',
      quoted_total: money(sqft * 76),
      lead_time: 'Confirm Bernalillo stock and delivery window before final bid.',
      delivery: 'Supplier delivery quote required for single or staged drop.',
      status: 'Compare lead time',
      next_action: 'Request dry-in takeoff and compare against Lowe’s and RAKS openings path.',
      action_label: 'Send to COGS',
    },
    {
      id: 'sip-pur-panels',
      project_id: project.id,
      supplier: 'SIP/PUR Panel Supplier',
      category: 'panelized shell',
      scope: 'Pre-cut SIP/PUR panelized shell replacing conventional exterior framing, sheathing, insulation, and some field labor.',
      quoted_total: money(16000 + sqft * 64),
      lead_time: 'Shop drawings, cut list, production slot, then coordinated delivery.',
      delivery: 'Panel truck delivery; verify access, unload plan, and install crew timing.',
      status: 'Compare labor savings',
      next_action: 'Validate panel layout, connection details, delivery access, and labor-day reduction.',
      action_label: 'Send to COGS',
    },
    {
      id: 'conventional-package',
      project_id: project.id,
      supplier: 'Conventional Build Package',
      category: 'conventional shell',
      scope: 'Stick framing package with lumber/framing, sheathing, insulation, exterior framing labor, and dry-in materials separated.',
      quoted_total: money(sqft * 112),
      lead_time: 'Material availability plus field framing and inspection schedule.',
      delivery: 'Staged lumber, sheathing, insulation, roofing, and wrap drops.',
      status: 'Baseline comparison',
      next_action: 'Use as the benchmark against SIP/PUR schedule and labor savings.',
      action_label: 'Send to COGS',
    },
  ];
}

function slug(value) {
  return String(value || 'custom-vendor')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'custom-vendor';
}

function normalizeCustomPackages(customPackages = [], project = {}) {
  return customPackages
    .filter(pkg => !pkg.project_id || !project.id || pkg.project_id === project.id)
    .map(pkg => ({
      id: pkg.id || `custom-${slug(pkg.supplier)}-${slug(pkg.category)}`,
      project_id: pkg.project_id || project.id,
      supplier: pkg.supplier || 'Custom Vendor',
      category: pkg.category || 'custom vendor',
      scope: pkg.scope || pkg.package || 'Custom supplier materials package.',
      quoted_total: money(pkg.quoted_total),
      lead_time: pkg.lead_time || 'Confirm supplier lead time.',
      delivery: pkg.delivery || 'Confirm delivery requirement and delivery cost.',
      status: pkg.status || 'Needs quote',
      next_action: pkg.next_action || 'Request supplier quote, lead time, delivery cost, and substitutions.',
      action_label: pkg.action_label || 'Send to COGS',
    }));
}

function compareBuildMethods(project = {}) {
  const sqft = projectSqft(project);
  const bidTotal = projectBidTotal(project);
  const conventionalMaterial = money(sqft * 112);
  const conventionalLabor = money(sqft * 58);
  const conventionalTotal = conventionalMaterial + conventionalLabor;
  const sipPurMaterial = money(16000 + sqft * 64);
  const sipPurLabor = money(sqft * 31);
  const sipPurTotal = sipPurMaterial + sipPurLabor;

  return {
    conventional: {
      method: 'Conventional stick-built package',
      material_cogs: conventionalMaterial,
      labor_cogs: conventionalLabor,
      total_cogs: conventionalTotal,
      labor_days: 18,
      schedule_effect: 'baseline framing, sheathing, insulation, and dry-in path',
      gross_profit: bidTotal - conventionalTotal,
    },
    sip_pur: {
      method: 'SIP/PUR panelized shell',
      material_cogs: sipPurMaterial,
      labor_cogs: sipPurLabor,
      total_cogs: sipPurTotal,
      labor_days: 10,
      days_saved: 8,
      schedule_effect: 'faster dry-in path with lower field labor and lower weather exposure',
      gross_profit: bidTotal - sipPurTotal,
    },
  };
}

function buildSupplierBidout({ project = {}, customPackages = [] } = {}) {
  const packages = [...packageDefaults(project), ...normalizeCustomPackages(customPackages, project)].map(pkg => ({
    ...pkg,
    project_id: pkg.project_id || project.id,
    quoted_total: money(pkg.quoted_total),
    action_label: pkg.action_label || 'Send to COGS',
  }));

  return {
    version: 'Version 10',
    project_id: project.id || null,
    model: project.model || null,
    sqft: projectSqft(project),
    categories: MATERIAL_CATEGORIES,
    packages,
    comparison: compareBuildMethods(project),
  };
}

function sendSupplierPackageToCogs(state = {}, { project_id, package_id } = {}) {
  const projects = Array.isArray(state.projects) ? state.projects : [];
  const project = projects.find(row => row.id === project_id) || { id: project_id };
  const customPackages = [
    ...(Array.isArray(state.supplier_packages) ? state.supplier_packages : []),
    ...(Array.isArray(state.supplier_quotes) ? state.supplier_quotes : []),
  ];
  const selected = buildSupplierBidout({
    project,
    customPackages,
  }).packages.find(pkg => pkg.id === package_id);
  if (!selected) {
    const error = new Error(`Unknown supplier package: ${package_id}`);
    error.status = 404;
    throw error;
  }

  const estimateSections = Array.isArray(state.estimate_sections) ? state.estimate_sections : [];
  const existingSection = estimateSections.find(row => row.project_id === project_id && row.section === 'Supplier COGS');
  const otherSections = estimateSections.filter(row => row !== existingSection);
  const existingItems = Array.isArray(existingSection?.items) ? existingSection.items : [];
  const item = {
    id: `supplier-cogs-${selected.id}`,
    source: 'supplier-bidout',
    supplier: selected.supplier,
    category: selected.category,
    description: selected.scope,
    qty: 1,
    unit: 'pkg',
    unit_cost: selected.quoted_total,
    total: selected.quoted_total,
    delivery: selected.delivery,
    lead_time: selected.lead_time,
    internal_only: true,
  };
  const items = [
    item,
    ...existingItems.filter(row => row.id !== item.id),
  ];
  const section = {
    project_id,
    section: 'Supplier COGS',
    items,
    subtotal: items.reduce((sum, row) => sum + money(row.total || row.unit_cost), 0),
  };
  const updatedProjects = projects.map(row => {
    if (row.id !== project_id) return row;
    const currentLow = money(row.cogs_low);
    const currentHigh = money(row.cogs_high);
    return {
      ...row,
      cogs_low: Math.max(currentLow, section.subtotal),
      cogs_high: Math.max(currentHigh, section.subtotal),
      supplier_status: 'Supplier COGS imported',
      next_action: `Review imported ${selected.supplier} COGS and confirm final supplier path.`,
    };
  });
  const activity = Array.isArray(state.activity) ? state.activity : [];

  return {
    ...state,
    projects: updatedProjects,
    estimate_sections: [section, ...otherSections],
    activity: [
      {
        id: `activity-${Date.now()}`,
        type: 'Supplier COGS',
        detail: `Send to COGS: ${selected.supplier} ${selected.category} package added to ${project_id}.`,
        at: new Date().toISOString(),
      },
      ...activity,
    ].slice(0, 40),
  };
}

module.exports = {
  MATERIAL_CATEGORIES,
  buildSupplierBidout,
  compareBuildMethods,
  sendSupplierPackageToCogs,
};
