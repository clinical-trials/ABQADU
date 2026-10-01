const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const validAmount = value => typeof value === 'string' && /^\d+(?:\.\d{1,2})?$/.test(value.trim())
  && Number(value) > 0 && Number(value) <= 1000000;

export function validateReceiptReview(draft) {
  const errors = [];
  if (typeof draft?.vendor !== 'string' || !draft.vendor.trim() || draft.vendor.trim().length > 120
    || /[\u0000-\u001f\u007f]/.test(draft.vendor)) errors.push('Enter a vendor name of 1–120 characters.');
  if (!validDate(draft?.date)) errors.push('Enter the receipt date shown on the receipt.');
  if (!validAmount(draft?.amount)) errors.push('Enter a total greater than $0 and no more than $1,000,000, with up to two decimal places.');
  return errors;
}

export function parseReceiptDraft(rawText) {
  const result = { vendor: '', date: '', amount: '', warnings: [] };
  if (typeof rawText !== 'string' || !rawText.trim()) return result;
  if (rawText.length > 20000) return { ...result, warnings: ['Receipt text is too long. Keep it under 20,000 characters.'] };
  const lines = rawText.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  result.vendor = lines.find(line => /[A-Za-z]/.test(line) && line.length <= 120
    && !/^(?:receipt|invoice|welcome|thank you|customer copy|sales receipt|date|store\s*#|order|transaction|terminal|cashier|tel\b|phone\b|subtotal|total|grand total|tax\b|cash\b|change\b)/i.test(line)) || '';
  const totals = [];
  const dates = [];
  for (const line of lines) {
    const total = line.match(/^(grand\s+total|total\s+amount|total\s+due|amount\s+due|total)\s*[:=\-]?\s*(?:USD\s*|\$\s*)?(\d{1,3}(?:,\d{3})+\.\d{2}|\d+(?:\.\d{2})?)\s*$/i);
    if (total) {
      const amount = total[2].replace(/,/g, '');
      if (validAmount(amount)) totals.push({ amount: Number(amount).toFixed(2), rank: /^grand/i.test(total[1]) ? 3 : /^amount/i.test(total[1]) ? 1 : 2 });
    }
    const found = [...line.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4})\b/g)];
    for (const match of found) {
      const parts = match[1].split('/');
      const date = parts.length === 3 ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}` : match[1];
      if (validDate(date)) dates.push({ date, labeled: /^(?:transaction\s+date|purchase\s+date|date)\b/i.test(line) });
    }
  }
  if (totals.length) {
    const rank = Math.max(...totals.map(total => total.rank));
    const amounts = [...new Set(totals.filter(total => total.rank === rank).map(total => total.amount))];
    if (amounts.length === 1) result.amount = amounts[0];
    else result.warnings.push('Multiple totals were found. Enter the correct final receipt total.');
  } else result.warnings.push('A clear final total was not found. Check the receipt and enter it manually.');
  const preferredDates = dates.some(date => date.labeled) ? dates.filter(date => date.labeled) : dates;
  const uniqueDates = [...new Set(preferredDates.map(date => date.date))];
  if (uniqueDates.length === 1) result.date = uniqueDates[0];
  else result.warnings.push(uniqueDates.length > 1 ? 'Multiple dates were found. Confirm the purchase date.' : 'The purchase date was not found. Enter the date from the receipt.');
  if (!result.vendor) result.warnings.push('The vendor was not found. Enter the vendor from the receipt.');
  return result;
}
