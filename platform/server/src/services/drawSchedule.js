const PRECONSTRUCTION_CENTS = 1000000;
const MAX_CENTS = 999999999999;

function invalid(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function buildFourInvoiceSchedule(total) {
  if (!['number', 'string'].includes(typeof total) || (typeof total === 'number' && !Number.isFinite(total))) {
    invalid('Enter a valid quoted total before preparing the four-invoice schedule.');
  }
  const text = String(total).trim();
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(text)) {
    invalid('The quoted total must be a positive USD amount with at most two decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  const totalCents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (totalCents > MAX_CENTS) invalid('The quoted total exceeds the supported invoice amount.');
  const remaining = totalCents - PRECONSTRUCTION_CENTS;
  const half = Math.round(remaining / 2);
  const quarter = Math.round(remaining / 4);
  const final = remaining - half - quarter;
  if (remaining <= 0 || [half, quarter, final].some(amount => amount <= 0)) {
    invalid('The quoted total must be at least $10,000.04 so the credited $10,000 preconstruction invoice leaves three positive installments.');
  }
  return [
    { draw_type: 'deposit', description: 'Preconstruction ($10,000 credited toward total)', amount: PRECONSTRUCTION_CENTS / 100, suggested_send_day: 0 },
    { draw_type: 'progress', description: 'Mobilization (50% of remaining balance)', amount: half / 100, suggested_send_day: 14 },
    { draw_type: 'progress', description: 'Dry-in / progress (25% of remaining balance)', amount: quarter / 100, suggested_send_day: 45 },
    { draw_type: 'final', description: 'Final / handoff (25% of remaining balance)', amount: final / 100, suggested_send_day: 75 },
  ];
}

module.exports = { buildFourInvoiceSchedule };
