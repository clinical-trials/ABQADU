const fs = require('fs');
const os = require('os');
const path = require('path');

describe('saved project readiness', () => {
  let store;
  let directory;
  let originalStorePath;

  beforeEach(async () => {
    originalStorePath = process.env.COMMAND_CENTER_STORE_PATH;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'abqadu-readiness-'));
    process.env.COMMAND_CENTER_STORE_PATH = path.join(directory, 'store.json');
    jest.resetModules();
    store = require('../src/services/commandCenterStore');
    await store.resetCommandCenter();
  });

  afterEach(() => {
    if (originalStorePath === undefined) delete process.env.COMMAND_CENTER_STORE_PATH;
    else process.env.COMMAND_CENTER_STORE_PATH = originalStorePath;
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('ordinary edits update readiness after save and reload while preserving builder notes', async () => {
    let project = {
      id: 'review-project',
      address: '435 Amherst Dr NE',
      status: 'Call homeowner Friday',
      next_action: 'Review site findings with the client.',
      custom_details: { access: 'Side gate' },
      readiness_label: 'Stale readiness',
      site_visit_status: 'Needs scheduling',
      utility_review_status: 'Needs confirmation',
      sewer_confirmation_status: 'Needs sewer confirmation study',
      setbacks_site_plan_status: 'Needs site plan',
    };

    for (const [change, expected] of [
      [{}, 'Missing site data'],
      [{ site_visit_status: 'Completed' }, 'Needs utility review'],
      [{ utility_review_status: 'Confirmed' }, 'Needs sewer confirmation'],
      [{ sewer_confirmation_status: 'Confirmed' }, 'Needs site plan'],
      [{ setbacks_site_plan_status: 'Confirmed' }, 'Ready to send'],
      [{ utility_review_status: 'Needs confirmation' }, 'Needs utility review'],
    ]) {
      project = { ...project, ...change };
      const input = { projects: [project] };
      const before = JSON.parse(JSON.stringify(input));
      const saved = await store.saveCommandCenter(input);
      const loaded = await store.loadCommandCenter();

      expect(saved.projects[0].readiness_label).toBe(expected);
      expect(loaded.projects[0].readiness_label).toBe(expected);
      expect(loaded.projects[0]).toMatchObject({
        status: 'Call homeowner Friday',
        next_action: 'Review site findings with the client.',
        custom_details: { access: 'Side gate' },
      });
      expect(input).toEqual(before);
    }
  });

  test('loading existing records replaces stale derived readiness without changing stored fields', async () => {
    fs.writeFileSync(store.storePath, JSON.stringify({
      version: 'Version 10',
      builder: { company: 'ABQ ADU' },
      projects: [{
        id: 'legacy-project',
        address: '435 Amherst Dr NE',
        site_visit_status: 'Completed',
        utility_review_status: 'Needs confirmation',
        readiness_label: 'Ready to send',
        status: 'Custom builder status',
      }],
    }));

    const loaded = await store.loadCommandCenter();

    expect(loaded.projects[0].readiness_label).toBe('Needs utility review');
    expect(loaded.projects[0].status).toBe('Custom builder status');
    expect(loaded.builder.company).toBe('ABQ ADU');
  });

  test.each(['load', 'save'])('%s fills missing legacy site checks before deriving readiness', async operation => {
    const legacyProject = {
      id: 'legacy-project',
      address: '435 Amherst Dr NE',
      status: 'Client will call Friday',
    };
    let state;
    if (operation === 'load') {
      fs.writeFileSync(store.storePath, JSON.stringify({ projects: [legacyProject] }));
      state = await store.loadCommandCenter();
    } else {
      state = await store.saveCommandCenter({ projects: [legacyProject] });
    }

    expect(state.projects[0]).toMatchObject({
      site_visit_status: 'Needs scheduling',
      utility_review_status: 'Needs confirmation',
      sewer_confirmation_status: 'Needs sewer confirmation study',
      setbacks_site_plan_status: 'Needs site plan',
      readiness_label: 'Missing site data',
      status: 'Client will call Friday',
    });
    expect(legacyProject).not.toHaveProperty('site_visit_status');
  });
});
