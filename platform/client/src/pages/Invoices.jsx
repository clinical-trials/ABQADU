import React, { useState } from 'react';
import { requestJson, requestPdf } from '../utils/api';
import useApiList from '../hooks/useApiList';
import useApiAction from '../hooks/useApiAction';
import useBillingIntegrations from '../hooks/useBillingIntegrations';
import ApiError from '../components/ApiError';
import InvoiceBillingActions from '../components/InvoiceBillingActions';
import { getAuthSession } from '../utils/authFetch';
import { readManualPayment, saveManualPayment, clearManualPayment, newPaymentRequestId, validateManualAmount } from '../utils/manualPaymentDraft';
import './Invoices.css';

const fmt = n => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ledgerStatus = invoice => Number(invoice.amount) > 0 && Number(invoice.paid) >= Number(invoice.amount) ? 'paid' : invoice.status === 'paid' ? 'sent' : invoice.status || 'draft';
const today = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; };

const STATUS = {
  draft:   { bg: '#F3F4F6', fg: '#6B7280' },
  sent:    { bg: '#DBEAFE', fg: '#1E40AF' },
  paid:    { bg: '#D1FAE5', fg: '#065F46' },
  overdue: { bg: '#FEE2E2', fg: '#B91C1C' },
};

export default function Invoices() {
  const { data: invoices, loading, error, reload: load } = useApiList('/api/invoices');
  const { run, pending, error: actionError } = useApiAction();
  const billingIntegrations = useBillingIntegrations();
  const [payFor, setPayFor]     = useState(null);
  const [payAmt, setPayAmt]     = useState('');
  const [payMethod, setPayMethod] = useState('check');
  const [payDate, setPayDate] = useState('');
  const [payReference, setPayReference] = useState('');
  const [owner] = useState(getAuthSession);
  const [payAttempt, setPayAttempt] = useState(null);
  const [paymentReview, setPaymentReview] = useState(null);

  const setStatus = (id, status) => run(async () => {
    await requestJson(`/api/invoices/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    await load();
  });

  const openPayment = inv => {
    const saved = readManualPayment(owner, inv.id);
    setPayFor(inv); setPayAttempt(saved); setPaymentReview(null);
    setPayAmt(saved?.body?.amount || Number(inv.balance).toFixed(2));
    setPayMethod(saved?.body?.method || 'check');
    setPayDate(saved ? saved.body?.paid_date || '' : today());
    setPayReference(saved?.body?.reference || '');
  };
  const recordPayment = () => run(async () => {
    if (payAttempt?.invalid) throw new Error('The saved payment retry could not be read. Review recorded payments before starting a different payment.');
    validateManualAmount(payAmt);
    if (!payAttempt && (!/^\d{4}-\d{2}-\d{2}$/.test(payDate) || !Number.isFinite(Date.parse(`${payDate}T12:00:00Z`)) || new Date(`${payDate}T12:00:00Z`).toISOString().slice(0, 10) !== payDate || payDate > today())) throw new Error('Enter the date this payment was received, today or earlier.');
    if (!payAttempt && payReference.trim().length > 80) throw new Error('Keep the check number or reference to 80 characters.');
    if (!payAttempt && Number(payAmt) > Number(payFor.balance)) throw new Error('Payment exceeds the displayed balance. Refresh invoices before continuing.');
    const attempt = payAttempt || saveManualPayment(owner, payFor.id, {
      amount: payAmt, method: payMethod, paid_date: payDate, reference: payReference.trim(), request_id: newPaymentRequestId(),
    });
    setPayAttempt(attempt);
    const recorded = await requestJson(`/api/invoices/${payFor.id}/payments`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, authSession: owner,
      body: JSON.stringify(attempt.body),
    });
    if (recorded?.manual_request_key !== attempt.body.request_id || String(recorded?.invoice_id) !== String(payFor.id)
      || Number(recorded?.amount) !== Number(attempt.body.amount)) throw new Error('The server did not confirm this payment. Retry the saved request to check its result safely.');
    clearManualPayment(owner, payFor.id, attempt.body.request_id);
    setPayAttempt(null); setPayFor(null); setPayAmt(''); await load();
  });
  const reviewDifferentPayment = () => run(async () => {
    const latest = await requestJson(`/api/invoices/${payFor.id}`, { authSession: owner });
    if (String(latest?.id) !== String(payFor.id) || !Array.isArray(latest.payments)) throw new Error('Recorded payments could not be verified. Retry the existing payment or refresh later.');
    const recorded = payAttempt?.body?.request_id && latest.payments.find(payment => payment.manual_request_key === payAttempt.body.request_id);
    if (recorded) {
      clearManualPayment(owner, payFor.id, payAttempt.body.request_id);
      setPayAttempt(null); setPayFor(null); await load();
      return;
    }
    setPaymentReview(latest);
  });
  const startDifferentPayment = () => {
    if (!paymentReview || pending) return;
    if (!clearManualPayment(owner, payFor.id, payAttempt?.body?.request_id || null)) return;
    setPayFor(paymentReview); setPayAttempt(null); setPaymentReview(null);
    setPayAmt(Math.max(0, Number(paymentReview.balance)).toFixed(2)); setPayMethod('check');
    setPayDate(today()); setPayReference('');
  };

  const downloadPdf = inv => run(() => requestPdf(`/api/invoices/${inv.id}/pdf`, { method: 'POST' }, `${inv.invoice_number}.pdf`));

  const totalBilled = invoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0);
  const totalPaid   = invoices.reduce((s, i) => s + parseFloat(i.paid || 0), 0);
  const outstanding = totalBilled - totalPaid;

  return (
    <div className="invoices-page" style={{ fontFamily: 'DM Sans, sans-serif', background: '#FAF7F2', minHeight: '100vh' }}>
      <div style={{ background: '#1C1917', color: '#F0EBE1', padding: '20px 32px' }}>
        <h1 style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900, fontSize: 28, letterSpacing: '.02em', margin: 0 }}>
          Invoices &amp; checks
        </h1>
      </div>

      <ApiError message={error} onRetry={load} />
      {!payFor && <ApiError message={actionError} />}
      {loading && <p role="status">Loading invoices…</p>}
      {/* KPI strip */}
      <div className="invoice-kpis" style={{ display: 'grid', gap: 16, padding: '20px 24px', maxWidth: 1100, margin: '0 auto' }}>
        {[['Total Billed', totalBilled, '#1C1917'], ['Collected', totalPaid, '#3D5247'], ['Outstanding', outstanding, '#B85C38']].map(([l, v, c]) => (
          <div key={l} style={{ background: '#FFF', border: '1px solid #E7E0D5', borderRadius: 8, padding: 18 }}>
            <div style={{ fontFamily: 'Barlow Condensed, sans-serif', fontSize: 30, fontWeight: 900, color: c }}>{fmt(v)}</div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#78716C', marginTop: 2 }}>{l}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 24px 24px', maxWidth: 1100, margin: '0 auto', overflowX:'auto' }}>
        <p style={{fontSize:14,color:'#57534e',lineHeight:1.6}}>Send the invoice PDF, then record the homeowner’s check when received. Recorded payments reduce the balance; recording a check does not confirm bank clearance.</p>
        <button disabled={pending || loading} onClick={() => { load(); billingIntegrations.reload(); }} style={{marginBottom:12,minHeight:44}}>Refresh invoices</button>
        <table className="invoice-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#FFF', borderRadius: 8, overflow: 'hidden' }}>
          <thead>
            <tr style={{ background: '#F5F0E8' }}>
              {['Invoice', 'Client', 'Description', 'Amount', 'Paid', 'Balance', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 10, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#78716C' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.map(inv => (
              <tr key={inv.id} style={{ borderBottom: '1px solid #F0EBE1' }}>
                <td data-label="Invoice" style={{ padding: '10px 12px', fontWeight: 600 }}>{inv.invoice_number}</td>
                <td data-label="Client" style={{ padding: '10px 12px', color: '#57534E' }}>{inv.client_name || '—'}</td>
                <td data-label="Description" style={{ padding: '10px 12px', color: '#78716C', fontSize: 12 }}>{inv.description}</td>
                <td data-label="Amount" style={{ padding: '10px 12px', textAlign: 'right' }}>{fmt(inv.amount)}</td>
                <td data-label="Paid" style={{ padding: '10px 12px', textAlign: 'right', color: '#3D5247' }}>{fmt(inv.paid)}</td>
                <td data-label="Balance" style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: parseFloat(inv.balance) > 0 ? '#B85C38' : '#3D5247' }}>{fmt(inv.balance)}</td>
                <td data-label="Status" style={{ padding: '10px 12px' }}>
                  <select aria-label={`Status for ${inv.invoice_number}`} disabled={pending || ledgerStatus(inv) === 'paid'} value={ledgerStatus(inv)} onChange={e => setStatus(inv.id, e.target.value)}
                    style={{ padding: '4px 8px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 12, fontWeight: 600,
                      background: (STATUS[ledgerStatus(inv)] || {}).bg, color: (STATUS[ledgerStatus(inv)] || {}).fg }}>
                    {['draft', 'sent', 'overdue'].map(s => <option key={s} value={s}>{s}</option>)}
                    {ledgerStatus(inv) === 'paid' && <option value="paid">paid</option>}
                  </select>
                </td>
                <td className="invoice-actions" style={{ padding: '10px 12px' }}>
                  {(parseFloat(inv.balance) > 0 || readManualPayment(owner, inv.id)) && (
                    <button disabled={pending} onClick={() => openPayment(inv)}
                      style={{ background: '#3D5247', color: '#FFF', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer', marginRight: 6 }}>
                      {readManualPayment(owner, inv.id) ? 'Resume payment' : 'Record check'}
                    </button>
                  )}
                  <button disabled={pending} onClick={() => downloadPdf(inv)}
                    style={{ background: 'none', border: '1px solid #C4954A', color: '#C4954A', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' }}>
                    PDF
                  </button>
                  <InvoiceBillingActions invoice={inv} onChanged={load} integrations={billingIntegrations.integrations} integrationsLoading={billingIntegrations.loading} integrationError={billingIntegrations.error} />
                </td>
              </tr>
            ))}
            {!loading && !error && !invoices.length && (
              <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#A8A29E' }}>No invoices yet — accept a bid to generate a draw schedule.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Payment modal */}
      {payFor && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => !pending && e.target === e.currentTarget && setPayFor(null)}>
          <div role="dialog" aria-modal="true" aria-label={payMethod === 'check' ? 'Record check' : 'Record payment'} className="invoice-payment-dialog" style={{ background: '#FFF', borderRadius: 8, padding: 24, width: 400, maxWidth: 'calc(100vw - 32px)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{payMethod === 'check' ? 'Record check' : 'Record payment'}</div>
            <ApiError message={actionError} />
            <div style={{ fontSize: 12, color: '#A8A29E', marginBottom: 16 }}>{payFor.invoice_number} · Balance {fmt(payFor.balance)}</div>
            <label style={{ fontSize: 12, color: '#57534E' }}>Amount</label>
            <input aria-label="Payment amount" type="number" min="0.01" step="0.01" disabled={pending || Boolean(payAttempt)} value={payAmt} onChange={e => setPayAmt(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 14, marginBottom: 12, marginTop: 4 }} />
            <label style={{ fontSize: 12, color: '#57534E' }}>Method</label>
            <select aria-label="Payment method" disabled={pending || Boolean(payAttempt)} value={payMethod} onChange={e => setPayMethod(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', border: '1px solid #E7E0D5', borderRadius: 4, fontSize: 14, marginBottom: 16, marginTop: 4 }}>
              {['check', 'card', 'ach', 'cash'].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <label htmlFor="invoice-payment-date" style={{ fontSize: 13, color: '#57534E' }}>Date received</label>
            <input id="invoice-payment-date" aria-label="Date received" type="date" max={today()} disabled={pending || Boolean(payAttempt)} value={payDate} onChange={e => setPayDate(e.target.value)} />
            {payAttempt && !payAttempt.body?.paid_date && <p style={{fontSize:12}}>This saved request uses its original server-recorded date.</p>}
            <label htmlFor="invoice-payment-reference" style={{ fontSize: 13, color: '#57534E' }}>{payMethod === 'check' ? 'Check number or reference' : 'Payment reference'} <span style={{fontWeight:400}}>(optional)</span></label>
            <input id="invoice-payment-reference" aria-label={payMethod === 'check' ? 'Check number or reference' : 'Payment reference'} type="text" maxLength={80} disabled={pending || Boolean(payAttempt)} value={payReference} onChange={e => setPayReference(e.target.value)} placeholder={payMethod === 'check' ? 'e.g. Check 1042' : 'Receipt or transaction reference'} />
            <p style={{fontSize:13,lineHeight:1.5,color:'#57534e'}}>Record money already received. This updates the invoice balance; it does not process a payment or confirm bank clearance.</p>
            {payAttempt && <div style={{fontSize:13,marginBottom:16}}>
              <p role="status">This payment may already have been recorded. Retry with the saved amount and method to avoid recording it twice.</p>
              {payAttempt.storageUnavailable && <p role="status">Browser storage is unavailable. This retry is kept only in this open page; resolve it before closing or reloading.</p>}
              {payAttempt.invalid && <p role="alert">The saved payment details could not be read. Review recorded payments before continuing.</p>}
              <button disabled={pending} onClick={reviewDifferentPayment}>Start a different payment</button>
              {paymentReview && <div>
                <p>Review the recorded payments below. The previous request may still finish. Continue only to record a different payment.</p>
                {paymentReview.payments.length ? <ul>{paymentReview.payments.map(payment => <li key={payment.id}>{fmt(payment.amount)} · {payment.method || 'Payment'} · {String(payment.paid_date || '').slice(0,10)}{payment.reference ? ` · ${payment.reference}` : ''}</li>)}</ul> : <p>No payments are currently recorded.</p>}
                <button disabled={pending} onClick={startDifferentPayment}>I reviewed these payments; start a different payment</button>
              </div>}
            </div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={pending || payAttempt?.invalid} onClick={recordPayment} style={{ flex: 1, background: '#3D5247', color: '#FFF', border: 'none', borderRadius: 4, padding: '10px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{payMethod === 'check' ? 'Save check' : 'Save payment'}</button>
              <button disabled={pending} onClick={() => setPayFor(null)} style={{ border: '1px solid #E7E0D5', background: '#FFF', borderRadius: 4, padding: '10px 14px', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
