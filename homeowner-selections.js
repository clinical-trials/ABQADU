(function () {
  'use strict';

  const form = document.getElementById('selections-form');
  if (!form) return;
  const STORAGE_KEY = 'abqadu.homeowner-selections.v1';
  const VERSION = 1;
  const groups = [
    { id: 'kitchen', title: 'Kitchen & appliances', fields: ['dishwasher', 'cooking_setup', 'appliance_finish', 'refrigerator', 'ventilation', 'microwave', 'disposal'] },
    { id: 'comfort', title: 'Comfort & laundry', fields: ['ceiling_fans', 'heating_cooling', 'laundry', 'water_heater'] },
    { id: 'finishes', title: 'Cabinets & finishes', fields: ['cabinet_color', 'cabinet_style', 'countertop', 'flooring'] },
    { id: 'bath', title: 'Bath', fields: ['bath_layout', 'shower_enclosure', 'vanity', 'toilet'] },
  ];
  const fields = groups.flatMap(group => group.fields);
  const byId = id => document.getElementById(id);
  const field = key => form.elements.namedItem(key);
  const labels = Object.fromEntries(fields.map(key => [key, form.querySelector(`label[for="selection-${key}"]`).textContent.trim()]));
  const options = Object.fromEntries(fields.map(key => [key, Object.fromEntries(Array.from(field(key).options, option => [option.value, option.textContent.trim()]))]));
  const summaryField = byId('selection-summary');
  const printField = byId('print-summary-text');
  const saveStatus = byId('save-status');
  const storageStatus = byId('storage-status');
  const copyStatus = byId('copy-status');
  const deferredChoices = new Set(['', 'ask-builder', 'see-samples']);
  let savedFingerprint = null;
  let savedAt = null;
  let dirty = false;
  let downloadUrl = null;
  let copyRequest = 0;
  let saveFailed = false;

  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const exactKeys = (value, keys) => isObject(value) && Object.keys(value).length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key));
  const boundedText = (value, max) => typeof value === 'string' && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
  function normalizeText(input, max) {
    const value = input.value.slice(0, max).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
    if (input.value !== value) input.value = value;
    return value;
  }
  function currentValues() {
    return {
      projectNickname: normalizeText(byId('project-nickname'), 80),
      choices: Object.fromEntries(fields.map(key => [key, Object.prototype.hasOwnProperty.call(options[key], field(key).value) ? field(key).value : ''])),
      notes: Object.fromEntries(groups.map(group => [group.id, normalizeText(byId(`notes-${group.id}`), 1000)])),
    };
  }
  function fingerprint(values) {
    return JSON.stringify([values.projectNickname, fields.map(key => values.choices[key]), groups.map(group => values.notes[group.id])]);
  }
  const initialFingerprint = fingerprint(currentValues());
  function parseSaved(raw) {
    if (typeof raw !== 'string' || raw.length > 50000) return null;
    try {
      const record = JSON.parse(raw);
      if (!exactKeys(record, ['version', 'savedAt', 'projectNickname', 'choices', 'notes']) || record.version !== VERSION
        || typeof record.savedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(record.savedAt)
        || !Number.isFinite(Date.parse(record.savedAt)) || new Date(record.savedAt).toISOString() !== record.savedAt
        || !boundedText(record.projectNickname, 80) || !exactKeys(record.choices, fields) || !exactKeys(record.notes, groups.map(group => group.id))) return null;
      if (fields.some(key => typeof record.choices[key] !== 'string' || !Object.prototype.hasOwnProperty.call(options[key], record.choices[key]))
        || groups.some(group => !boundedText(record.notes[group.id], 1000))) return null;
      return record;
    } catch (_) { return null; }
  }
  function buildSummary(values) {
    const lines = [
      'ADU selections — planning preferences',
      'Prototype worksheet · for discussion with your builder',
      `Project nickname: ${values.projectNickname.trim() || 'Not provided'}`,
      '',
    ];
    for (const group of groups) {
      lines.push(group.title.toUpperCase());
      for (const key of group.fields) lines.push(`${labels[key]}: ${options[key][values.choices[key]]}`);
      lines.push(`Notes: ${values.notes[group.id].trim() || 'None added'}`, '');
    }
    lines.push('Planning preferences only. These choices are not product approvals, orders, a quote or a construction agreement.',
      'Exact products, dimensions, utility needs, layout suitability and availability need builder review.',
      'Undecided choices and requests for recommendations remain open for discussion.',
      'No prices or brands have been selected by this worksheet. Nothing has been sent.');
    return lines.join('\n');
  }
  function update() {
    const values = currentValues();
    const currentFingerprint = fingerprint(values);
    dirty = currentFingerprint !== (savedFingerprint || initialFingerprint);
    const chosen = fields.filter(key => !deferredChoices.has(values.choices[key])).length;
    byId('selection-progress').textContent = `${chosen} of ${fields.length} choices made`;
    summaryField.value = buildSummary(values);
    printField.textContent = summaryField.value;
    if (saveFailed) saveStatus.textContent = 'Latest save could not be completed. Keep this tab open, or copy, download or print your current summary.';
    else if (savedFingerprint === currentFingerprint) saveStatus.textContent = `Saved on this device at ${new Date(savedAt).toLocaleString()}. Nothing has been sent.`;
    else if (savedFingerprint) saveStatus.textContent = 'Unsaved changes. Your earlier device save is unchanged.';
    else saveStatus.textContent = 'Not saved on this device.';
    return values;
  }
  function preserveUnknownDraft() {
    storageStatus.textContent = 'An existing device draft could not be read by this version. It has been kept untouched and will not be overwritten. You can still copy, download or print this worksheet.';
  }
  function restore() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;
      const record = parseSaved(raw);
      if (!record) { preserveUnknownDraft(); return; }
      byId('project-nickname').value = record.projectNickname;
      for (const key of fields) field(key).value = record.choices[key];
      for (const group of groups) byId(`notes-${group.id}`).value = record.notes[group.id];
      savedFingerprint = fingerprint(record); savedAt = record.savedAt;
      storageStatus.textContent = 'Your last device save has been restored. Changes need another explicit save.';
    } catch (_) {
      storageStatus.textContent = 'Device storage is unavailable. Your worksheet still works in this tab; copy, download or print a summary to keep it.';
    }
  }
  function save() {
    const values = update();
    try {
      // Recheck immediately before the explicit save; never replace an unreadable or newer-format draft.
      const existing = window.localStorage.getItem(STORAGE_KEY);
      if (existing !== null && !parseSaved(existing)) { saveFailed = true; preserveUnknownDraft(); update(); return; }
      const record = { version: VERSION, savedAt: new Date().toISOString(), ...values };
      const serialized = JSON.stringify(record);
      window.localStorage.setItem(STORAGE_KEY, serialized);
      if (window.localStorage.getItem(STORAGE_KEY) !== serialized) throw new Error('Device save could not be verified');
      savedFingerprint = fingerprint(values); savedAt = record.savedAt; saveFailed = false;
      storageStatus.textContent = 'This save stays in this browser profile on this device. Nothing has been sent.';
    } catch (_) {
      saveFailed = true;
      storageStatus.textContent = 'Device storage may be blocked or full. Your current choices are still in this tab; copy, download or print them. An earlier save may still be available.';
    }
    update();
  }
  function selectForManualCopy() {
    update(); byId('summary-details').open = true; summaryField.focus(); summaryField.select();
    copyStatus.textContent = 'The current summary is selected. Copy it manually with your device’s Copy command.';
  }
  async function copy() {
    update(); const snapshot = summaryField.value, request = ++copyRequest;
    copyStatus.textContent = 'Preparing to copy…';
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(snapshot);
      if (request !== copyRequest) return;
      update();
      copyStatus.textContent = summaryField.value === snapshot ? 'Summary copied. Nothing has been sent.' : 'An earlier version was copied while you were editing. Copy again for the current summary.';
    } catch (_) { if (request === copyRequest) selectForManualCopy(); }
  }
  function releaseDownload() {
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); downloadUrl = null; }
  }
  function download() {
    update(); releaseDownload(); let link;
    try {
      downloadUrl = URL.createObjectURL(new Blob([summaryField.value], { type: 'text/plain;charset=utf-8' }));
      link = document.createElement('a'); link.href = downloadUrl; link.download = 'adu-planning-selections.txt';
      document.body.appendChild(link); link.click();
      copyStatus.textContent = 'Text download requested. Check your browser’s downloads to keep the file. Nothing has been sent.';
    } catch (_) {
      releaseDownload(); selectForManualCopy();
      copyStatus.textContent = 'The download could not be prepared. The current summary is selected for manual copying.';
    } finally { link?.remove(); }
  }
  function print() {
    update();
    try { window.print(); }
    catch (_) { selectForManualCopy(); copyStatus.textContent = 'Printing is unavailable here. Copy or download the current summary instead.'; }
  }
  form.addEventListener('submit', event => event.preventDefault());
  for (const type of ['input', 'change']) form.addEventListener(type, () => { saveFailed = false; copyStatus.textContent = ''; update(); });
  byId('save-selections').addEventListener('click', save);
  byId('copy-summary').addEventListener('click', copy);
  byId('download-summary').addEventListener('click', download);
  byId('print-summary').addEventListener('click', print);
  window.addEventListener('beforeprint', update);
  window.addEventListener('beforeunload', event => { update(); if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { copyRequest += 1; releaseDownload(); });
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    const record = event.newValue === null ? null : parseSaved(event.newValue);
    savedFingerprint = record ? fingerprint(record) : null; savedAt = record?.savedAt || null;
    if (event.newValue !== null && !record) preserveUnknownDraft();
    else storageStatus.textContent = 'The device save changed in another tab. Your visible worksheet has not been replaced; review it before saving again.';
    update();
  });
  restore(); update();
  // Enable editing only after the no-submit listener and local-only actions are ready.
  byId('project-nickname').disabled = false;
  for (const group of groups) byId(`group-${group.id}`).disabled = false;
  for (const id of ['save-selections', 'copy-summary', 'download-summary', 'print-summary']) byId(id).disabled = false;
}());
