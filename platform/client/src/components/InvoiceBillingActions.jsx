import React, { useState } from 'react';
import { requestJson } from '../utils/api';
import useApiAction from '../hooks/useApiAction';
import ApiError from './ApiError';

export function safePortalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)) ? url.href : null;
  } catch { return null; }
}

export default function InvoiceBillingActions({ invoice, onChanged, integrations, integrationError, integrationsLoading }) {
  const { run, pending, error } = useApiAction();
  const [checkout, setCheckout] = useState(null);
  const createCheckout = () => run(async () => {
    setCheckout(null);
    const result = await requestJson(`/api/billing/invoices/${invoice.id}/checkout`, { method: 'POST' });
    const url = safePortalUrl(result?.url);
    if (String(result?.invoice_id) !== String(invoice.id) || !url || new URL(url).hostname !== 'checkout.stripe.com') {
      throw new Error('The payment link could not be verified for this invoice. Refresh and try again.');
    }
    setCheckout({ invoiceId: invoice.id, url });
  });
  const sync = action => run(async () => {
    await requestJson(`/api/invoice-engine/invoices/${invoice.id}/${action}`, { method: 'POST' });
    await onChanged();
  });
  const portal = safePortalUrl(invoice.invoiceshelf_public_url);
  const stripeReady = integrations?.stripe?.configured === true;
  const accountingReady = integrations?.invoiceshelf?.configured === true;
  const buttonStyle = { minHeight:44, padding:'7px 10px', border:'1px solid #a6b1aa', borderRadius:4, background:'#fff', color:'#3d5247', cursor:'pointer' };
  return <details style={{maxWidth:300,whiteSpace:'normal',marginTop:8}}>
    <summary style={{minHeight:44,padding:'10px 0',boxSizing:'border-box',cursor:'pointer',fontSize:12}}>Optional online tools{invoice.invoiceshelf_invoice_id ? ' · InvoiceShelf linked' : ''}</summary>
    <div style={{display:'grid',gap:10,padding:'4px 0 12px',lineHeight:1.5}}>
    <small>Built-in invoices, PDFs and recorded checks work without these services.</small>
    {integrationsLoading && <small role="status">Checking optional services…</small>}
    {integrationError && <small role="status">Optional service status is unavailable. Use Refresh invoices to check again.</small>}
    <b style={{fontSize:12}}>Online payments · Stripe</b>
    {stripeReady && Number(invoice.balance) > 0 && <button style={buttonStyle} disabled={pending} onClick={createCheckout}>Create payment link</button>}
    {stripeReady && checkout?.invoiceId === invoice.id && Number(invoice.balance) > 0 && <a href={checkout.url} target="_blank" rel="noopener noreferrer">Open payment link</a>}
    {stripeReady && Number(invoice.balance) > 0 && <small>Creating a link does not record a payment. Confirmed payments update the invoice automatically.</small>}
    {!stripeReady && !integrationsLoading && !integrationError && <small>Stripe is not configured. Checks can be recorded without an online payment account.</small>}
    <b style={{fontSize:12}}>Accounting export · InvoiceShelf</b>
    {accountingReady && (invoice.invoiceshelf_invoice_id
      ? <button style={buttonStyle} disabled={pending} onClick={()=>sync('status')}>Sync InvoiceShelf Status</button>
      : <button style={buttonStyle} disabled={pending || !invoice.client_id || Boolean(invoice.invoiceshelf_sync_error)} onClick={()=>sync('sync')}>Create InvoiceShelf invoice</button>)}
    {accountingReady && !invoice.client_id && <small>Link this invoice to a client before creating its InvoiceShelf copy.</small>}
    {!accountingReady && !integrationsLoading && !integrationError && <small>Optional: connect an InvoiceShelf account to create an accounting copy. No account is needed for this invoice or check tracking.</small>}
    {invoice.invoiceshelf_sync_error && <small role="status">InvoiceShelf needs review: {invoice.invoiceshelf_sync_error}</small>}
    {invoice.invoiceshelf_remote_status && <small>InvoiceShelf status: {invoice.invoiceshelf_remote_status}. The balance above uses recorded payments.</small>}
    {portal && <a href={portal} target="_blank" rel="noopener noreferrer">Open existing InvoiceShelf copy</a>}
    {accountingReady && <small>Check entries here do not automatically update the InvoiceShelf payment ledger.</small>}
    <ApiError message={error} />
    </div>
  </details>;
}
