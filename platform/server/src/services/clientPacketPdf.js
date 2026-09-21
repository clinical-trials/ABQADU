const puppeteer = require('puppeteer');

const moneyFormat = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});
const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Denver',
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function money(value) {
  return Number.isFinite(Number(value)) ? moneyFormat.format(Number(value)) : 'To be confirmed';
}

// Render only the client-view projection. Extra fields never become document content.
function renderClientPacketHtml(preview = {}) {
  const { brand = {}, project = {}, invoice_drafts = [], draw_schedule = [] } = preview;
  const stages = invoice_drafts.length ? invoice_drafts : draw_schedule;
  const generated = new Date(preview.generated_at);
  const date = Number.isNaN(generated.getTime()) ? '' : dateFormat.format(generated);
  const area = Number(project.sqft);
  const company = brand.company || 'ABQ ADU';
  const client = project.client || 'Homeowner';
  const paymentStages = stages.map((stage, index) => `<li class="stage">
    <span class="stage-number">${String(index + 1).padStart(2, '0')}</span>
    <div class="stage-detail"><h3>${escapeHtml(stage.label || `Payment stage ${index + 1}`)}</h3>
      ${stage.notes ? `<p>${escapeHtml(stage.notes)}</p>` : ''}
      <span class="stage-status">${escapeHtml(stage.status || 'Draft')}</span>
    </div><strong class="stage-amount">${escapeHtml(money(stage.amount))}</strong>
  </li>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'">
  <title>ABQ ADU - Estimate &amp; payment schedule</title>
  <style>
    @page { size: Letter; margin: .55in .6in; }
    * { box-sizing: border-box; }
    body { margin: 0; color: #25352c; font: 10pt/1.45 Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; overflow-wrap: anywhere; }
    h1,h2,h3,p { margin: 0; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 3px solid #bc714f; padding-bottom: 14px; }
    .brand { font-weight: 800; font-size: 26pt; line-height: 1; letter-spacing: -.6px; }
    .tagline { font-size: 9pt; color: #677468; margin-top: 8px; }
    address { font-style: normal; text-align: right; font-size: 8.5pt; max-width: 235px; color: #566356; }
    .title-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding-top: 18px; }
    .eyebrow { font-size: 9pt; color: #7a513c; font-weight: bold; margin-bottom: 5px; }
    h1 { font-size: 23pt; line-height: 1.13; letter-spacing: -.5px; max-width: 420px; }
    .date { color: #677468; font-size: 8.5pt; margin-top: 8px; }
    .status { border: 1px solid #d6c7aa; border-radius: 20px; padding: 5px 13px; font-weight: bold; font-size: 9pt; color: #6c5134; background: #faf5e9; }
    .intro { color: #566356; margin-top: 14px; font-size: 9pt; }
    .project { display: flex; justify-content: space-between; gap: 20px; background: #f4f5ef; border: 1px solid #dce1d4; border-radius: 8px; margin-top: 15px; padding: 14px 18px; break-inside: avoid; }
    dl { margin: 0; flex: 1; }
    dl div + div { margin-top: 10px; }
    dt { font-size: 8pt; font-weight: bold; text-transform: uppercase; letter-spacing: .5px; color: #677468; }
    dd { margin: 3px 0 0; font-size: 10pt; }
    .total { text-align: right; flex: 0 0 200px; align-self: center; }
    .total span { display: block; font-size: 8.5pt; color: #566356; }
    .total strong { display: block; font-size: 24pt; letter-spacing: -.6px; }
    .schedule { margin-top: 18px; }
    h2 { font-size: 14pt; line-height: 1.2; break-after: avoid; }
    .section-note { color: #677468; font-size: 8.5pt; margin: 5px 0 12px; }
    ol { list-style: none; padding: 0; margin: 0; }
    .stage { display: flex; gap: 12px; padding: 9px 0; border-top: 1px solid #dce1d4; break-inside: avoid; }
    .stage-number { flex: 0 0 27px; color: #aa6142; font-weight: bold; font-size: 12pt; }
    .stage-detail { flex: 1; min-width: 0; }
    h3 { font-size: 10pt; line-height: 1.3; }
    .stage-detail p { font-size: 8.5pt; color: #566356; margin-top: 4px; }
    .stage-status { display: inline-block; font-size: 7.5pt; color: #677468; margin-top: 3px; }
    .stage-amount { flex: 0 0 88px; text-align: right; font-size: 11pt; }
    .review { border-top: 1px solid #dce1d4; margin-top: 8px; padding-top: 13px; break-inside: avoid; }
    .review p { margin-top: 7px; font-size: 8.5pt; color: #566356; }
    footer { display: flex; justify-content: space-between; gap: 20px; border-top: 1px solid #dce1d4; margin-top: 15px; padding-top: 10px; color: #677468; font-size: 7.5pt; break-inside: avoid; }
  </style></head><body>
    <header class="header"><div><p class="brand">${escapeHtml(company)}</p><p class="tagline">A little more room. A lot more possibility.</p></div>
      <address>${brand.phone ? `<div>${escapeHtml(brand.phone)}</div>` : ''}${brand.address ? `<div>${escapeHtml(brand.address)}</div>` : ''}</address></header>
    <div class="title-row"><div><p class="eyebrow">Prepared for ${escapeHtml(client)}</p><h1>Estimate &amp; payment schedule</h1>${date ? `<p class="date">Prepared ${escapeHtml(date)}</p>` : ''}</div><span class="status">${escapeHtml(preview.status || 'Draft')}</span></div>
    <p class="intro">For your review. This draft is an estimate and proposed payment schedule; it is not a request for payment.</p>
    <section class="project"><dl><div><dt>Project address</dt><dd>${escapeHtml(project.address || 'To be confirmed')}</dd></div><div><dt>Your ADU</dt><dd>${escapeHtml(project.model || 'Model to be confirmed')}${Number.isFinite(area) && area > 0 ? ` · ${escapeHtml(area.toLocaleString('en-US'))} sq ft` : ''}</dd></div></dl><div class="total"><span>Estimated project total</span><strong>${escapeHtml(money(project.bid_total))}</strong></div></section>
    <section class="schedule"><h2>Your payment stages</h2><p class="section-note">Payments follow the agreed contract and project milestones.</p>${stages.length ? `<ol>${paymentStages}</ol>` : '<p>Payment stages will be confirmed after project review.</p>'}</section>
    <section class="review"><h2>Review notes</h2>${preview.readiness_label ? `<p><strong>Project review:</strong> ${escapeHtml(preview.readiness_label)}</p>` : ''}<p>${escapeHtml(preview.notes || 'Final scope, pricing, and payment terms are subject to project review and a signed agreement.')}</p>
      <footer><span>${escapeHtml(company)} · Built around your life.</span><span>Draft estimate · Prepared for ${escapeHtml(client)}</span></footer></section>
  </body></html>`;
}

async function closeBrowser(browser) {
  let timer;
  try {
    await Promise.race([
      browser.close(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PDF browser close timed out')), 3000); }),
    ]);
  } catch {
    browser.process()?.kill('SIGKILL');
  } finally {
    clearTimeout(timer);
  }
}

async function createClientPacketPdf(preview) {
  let browser;
  let timer;
  try {
    const launchOptions = { args: ['--no-sandbox'], timeout: 15000, protocolTimeout: 15000 };
    try {
      browser = await puppeteer.launch(launchOptions);
    } catch (error) {
      // A stale/missing Puppeteer download should not disable PDFs on a host
      // with Chrome installed. Preserve explicitly configured executables.
      if (process.env.PUPPETEER_EXECUTABLE_PATH) throw error;
      browser = await puppeteer.launch({ ...launchOptions, channel: 'chrome' });
    }
    const render = async () => {
      const page = await browser.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', request => { request.abort().catch(() => {}); });
      await page.setContent(renderClientPacketHtml(preview), { waitUntil: 'load', timeout: 10000 });
      const bytes = Buffer.from(await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true, timeout: 10000 }));
      if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF output');
      return bytes;
    };
    return await Promise.race([
      render(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('PDF generation timed out')), 20000); }),
    ]);
  } finally {
    clearTimeout(timer);
    if (browser) await closeBrowser(browser);
  }
}

module.exports = { renderClientPacketHtml, createClientPacketPdf };
