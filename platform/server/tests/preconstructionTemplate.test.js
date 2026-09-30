const { getPreconstructionTemplate } = require('../src/services/preconstructionTemplate');
const { normalizeTerms, defaultTerms, describeAgreement } = require('../src/services/preconstructionAgreement');

test('reusable letter agreement uses existing fields with blank parties and no invented approvals', () => {
  const template=getPreconstructionTemplate();
  expect(template.template_id).toBe('letter-agreement-v1');
  expect(template.terms).toEqual(normalizeTerms(template.terms));
  expect(Object.keys(template.terms).sort()).toEqual(Object.keys(defaultTerms()).sort());
  for(const key of ['owner_name','owner_email','owner_phone','property_address','contractor_name','contractor_address','contractor_email','contractor_phone','license_number','license_classification','construction_estimate','tax_amount']) expect(template.terms[key]).toBe('');
  expect(template.terms.fee).toBe('10000.00');
  expect(template.terms.tax_treatment).toBe('unconfirmed');
  expect(template.terms.fee_credit).toBe('unconfirmed');
  expect(template.terms.notice_review).toBe('unconfirmed');
  expect(describeAgreement(template.terms).totals.invoice_total_cents).toBeNull();
});

test('demo substitutes sample people and property while retaining editable source clauses', () => {
  const {terms}=getPreconstructionTemplate({demo:true});
  expect(terms.owner_name).toBe('Demo homeowner');
  expect(terms.property_address).toBe('Demo property — Albuquerque, NM');
  expect(terms.contractor_name).toBe('Fifth Element Construction');
  expect(terms.scope).toContain('may not be chosen');
  expect(terms.scope).toContain('automatically be superseded');
  expect(terms.scope).toContain('reasonable investigation');
  expect(terms.payment_terms).toContain('payable upon execution of the final signed preconstruction agreement');
  expect(terms.termination_terms).toContain('seven (7) days');
  expect(terms.termination_terms).toContain('whether completed or in process');
  expect(terms.termination_terms).toContain('assign to Owner');
  expect(terms.exclusions).toContain('48-2-2');
  expect(terms.third_party_costs).toContain('indemnify');
  expect(terms.notice_details).toContain('refund');
  const revised=normalizeTerms({...terms,fee:'12500'});
  expect(revised.payment_terms).not.toMatch(/10,?000/);
  expect(describeAgreement(revised).totals.fee_cents).toBe(1250000);
});

test('every call gets fresh draft terms and does not change generic defaults', () => {
  const before=defaultTerms();
  const first=getPreconstructionTemplate({demo:true}); first.terms.scope='Rewritten demo';
  expect(getPreconstructionTemplate({demo:true}).terms.scope).not.toBe('Rewritten demo');
  expect(getPreconstructionTemplate().terms.owner_name).toBe('');
  expect(defaultTerms()).toEqual(before);
});
