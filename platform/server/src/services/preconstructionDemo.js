const { normalizeTerms, describeAgreement, PreconstructionError } = require('./preconstructionAgreement');

function createPreconstructionDemoService({
  getTemplate = options => require('./preconstructionTemplate').getPreconstructionTemplate(options),
  renderPdf = record => require('./preconstructionPacketPdf').createPreconstructionPacketPdf(record),
  renderTimeoutMs = 55000,
} = {}) {
  function getDemo() {
    return {
      project: { id: 'precon-demo', client: 'Demo homeowner', address: 'Demo property — Albuquerque, NM' },
      agreement: null, defaults: getTemplate({ demo: true }).terms, history: [], demo: true,
    };
  }
  async function generatePacket(body, { signal } = {}) {
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).length !== 1 || !Object.prototype.hasOwnProperty.call(body, 'terms')) {
      throw new PreconstructionError(400, 'Provide only the demo agreement terms.');
    }
    const terms = normalizeTerms(body.terms);
    const record = { demo: true, terms, ...describeAgreement(terms) };
    const cancelled = () => new PreconstructionError(499, 'The demo PDF request was cancelled.');
    if (signal?.aborted) throw cancelled();
    let timer, onAbort;
    try {
      // A disconnect stops waiting for this response. The renderer separately
      // bounds browser operations and cleans up its browser, including late work.
      const pdf = await Promise.race([
        Promise.resolve().then(() => {
          if (signal?.aborted) throw cancelled();
          return renderPdf(record);
        }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Render deadline')), renderTimeoutMs); }),
        new Promise((_, reject) => {
          onAbort = () => reject(cancelled());
          signal?.addEventListener('abort', onAbort, { once: true });
        }),
      ]);
      if (!Buffer.isBuffer(pdf) || pdf.subarray(0, 5).toString() !== '%PDF-') throw new Error('Invalid PDF result');
      return { pdf };
    } catch (error) {
      if (signal?.aborted) throw cancelled();
      throw new PreconstructionError(503, 'The demo packet PDF is temporarily unavailable. Please try again.');
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }
  return { getTemplate, getDemo, generatePacket };
}

module.exports = { createPreconstructionDemoService };
