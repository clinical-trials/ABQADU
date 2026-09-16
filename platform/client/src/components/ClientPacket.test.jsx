import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ClientPacket from './ClientPacket';

const preview = {
  id: 'client-preview-1',
  type: 'Estimate preview',
  status: 'Draft',
  generated_at: '2026-09-16T12:00:00Z',
  brand: {
    company: 'ABQ ADU',
    phone: '505-977-7659',
    address: '131 Madison NE, Albuquerque, NM 87108',
  },
  project: {
    id: 'project-1',
    client: 'Alex Homeowner',
    address: '1428 Central Ave, Albuquerque, NM',
    model: 'Netherwood House',
    sqft: 640,
    bid_total: 180000,
    cogs_low: 113579,
    internal_notes: 'Private supplier negotiation',
  },
  readiness_label: 'Needs utility review',
  invoice_drafts: [
    { id: 'invoice-1', label: 'Invoice 1: $10,000 Preconstruction', amount: 10000, status: 'Draft', notes: 'Due with signed preconstruction contract.' },
    { id: 'invoice-2', label: 'Invoice 2: Contract Mobilization', amount: 90000, status: 'Draft', notes: 'After final contract approval.' },
    { id: 'invoice-3', label: 'Invoice 3: Dry-In Draw', amount: 45000, status: 'Draft', notes: 'Tied to dry-in and field progress.' },
    { id: 'invoice-4', label: 'Invoice 4: Final Draw', amount: 35000, status: 'Draft', notes: 'Tied to inspection closeout and handoff.' },
  ],
  draw_schedule: [],
  notes: 'Final contract depends on site review and engineering review.',
  metrics: { cogs_low_per_sqft: 177.47, gross_profit_floor: 66421 },
  internal_notes: 'Builder-only margin analysis',
};

let host;
let root;
let trigger;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  trigger = document.createElement('button');
  trigger.textContent = 'Open client preview';
  host.appendChild(trigger);
  document.body.appendChild(host);
  const mount = document.createElement('div');
  host.appendChild(mount);
  root = createRoot(mount);
  trigger.focus();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.restoreAllMocks();
  delete global.IS_REACT_ACT_ENVIRONMENT;
});

function renderPacket(data = preview) {
  function PreviewOwner() {
    const [open, setOpen] = useState(true);
    return open ? <ClientPacket preview={data} onClose={() => setOpen(false)} /> : null;
  }
  act(() => root.render(<PreviewOwner />));
  return document.querySelector('[role="dialog"]');
}

test('renders the homeowner estimate and payment stages without private project finances', () => {
  const dialog = renderPacket();
  expect(dialog).not.toBeNull();
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.getElementById(dialog.getAttribute('aria-labelledby')).textContent).toMatch(/estimate.*payment schedule/i);
  expect(dialog.textContent).toContain('ABQ ADU');
  expect(dialog.textContent).toContain('505-977-7659');
  expect(dialog.textContent).toContain('131 Madison NE');
  expect(dialog.textContent).toContain('Alex Homeowner');
  expect(dialog.textContent).toContain('1428 Central Ave');
  expect(dialog.textContent).toContain('Netherwood House');
  expect(dialog.textContent).toContain('640');
  expect(dialog.textContent).toContain('$180,000');
  expect(dialog.textContent).toContain('$90,000');
  expect(dialog.textContent).toContain('$45,000');
  expect(dialog.textContent).toContain('$35,000');
  expect(dialog.textContent).toContain('Invoice 1: $10,000 Preconstruction');
  expect(dialog.textContent).toContain('Due with signed preconstruction contract.');
  expect(dialog.textContent).toContain('Needs utility review');
  expect(dialog.textContent).toContain('Final contract depends on site review and engineering review.');
  expect(dialog.textContent).toMatch(/draft/i);
  expect(dialog.textContent).not.toMatch(/COGS|profit|margin|113,579|113579|66,421|66421|177\.47|Private supplier|Builder-only/i);
});

test('contains keyboard focus, closes with Escape, and restores the preview trigger', () => {
  const dialog = renderPacket();
  expect(dialog).not.toBeNull();
  const buttons = [...dialog.querySelectorAll('button')];
  const first = buttons[0];
  const last = buttons[buttons.length - 1];
  expect(document.activeElement).toBe(first);
  expect(host.getAttribute('aria-hidden')).toBe('true');
  expect(host.hasAttribute('inert')).toBe(true);

  act(() => first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(last);
  act(() => last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
  expect(document.activeElement).toBe(first);
  act(() => trigger.focus());
  expect(dialog.contains(document.activeElement)).toBe(true);

  act(() => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(host.hasAttribute('aria-hidden')).toBe(false);
  expect(host.hasAttribute('inert')).toBe(false);
  expect(document.body.classList.contains('client-packet-open')).toBe(false);
});

test('opens browser printing while keeping the packet in its isolated print container', () => {
  const print = jest.spyOn(window, 'print').mockImplementation(() => {});
  const dialog = renderPacket();
  expect(dialog).not.toBeNull();
  const printButton = [...dialog.querySelectorAll('button')].find(button => /print packet/i.test(button.textContent));
  expect(printButton).toBeDefined();
  act(() => printButton.click());
  expect(print).toHaveBeenCalledTimes(1);
  expect(document.body.classList.contains('client-packet-open')).toBe(true);
  expect(dialog.closest('.client-packet-overlay').parentElement).toBe(document.body);
});

test('uses the draw schedule when invoice drafts are unavailable', () => {
  const dialog = renderPacket({ ...preview, invoice_drafts: [], draw_schedule: preview.invoice_drafts });
  expect(dialog).not.toBeNull();
  expect(dialog.textContent).toContain('Invoice 4: Final Draw');
  expect(dialog.textContent).toContain('$35,000');
});
