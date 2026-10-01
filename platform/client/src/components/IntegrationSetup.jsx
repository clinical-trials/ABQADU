import React from 'react';
import { Link } from 'react-router-dom';
import './IntegrationSetup.css';

export const SERVICE_IDS = ['clerk', 'invoiceshelf', 'stripe', 'weather', 'twilio', 'ocr'];
const services = [
  {
    id: 'clerk', name: 'Clerk', purpose: 'Team sign-in option',
    description: 'Use individual staff accounts when the workspace is configured for Clerk.',
    available: 'Clerk is an alternative to admin password access. It is not needed for local access on this computer.',
    steps: ['Choose Clerk only if individual staff accounts are needed, then add the app settings and approved staff IDs privately.', 'Select Clerk as the sign-in mode, set the allowed app addresses, then restart the server and sign in.', 'Test that signed-out and unapproved accounts cannot open project data or trigger payments and texts.'],
  },
  {
    id: 'invoiceshelf', name: 'InvoiceShelf', purpose: 'Optional accounting export',
    description: 'Create a separate accounting copy of customers, estimates and invoices.',
    available: 'Built-in invoice PDFs and check tracking work without InvoiceShelf. An InvoiceShelf account is needed only to use this export.',
    steps: ['Set up an InvoiceShelf company with USD currency and connect its server address, company ID, and access token.', 'Create the InvoiceShelf customer from Clients, then create its invoice from Invoices.', 'Check the remote invoice and amount. If creation needs review, reconcile the remote record before retrying. Stripe payments are recorded locally; InvoiceShelf payment synchronization is separate.'],
  },
  {
    id: 'stripe', name: 'Stripe', purpose: 'Online payments',
    description: 'Create a checkout link for a saved invoice’s outstanding balance.',
    available: 'Stripe is not needed for checks. Record the check amount, received date and reference in Invoices.',
    steps: ['Connect your Stripe test account, return pages, and signed webhook endpoint.', 'Import saved Command Center invoice drafts, then create a payment link from Invoices.', 'Complete a test payment and confirm the invoice balance updates once before enabling live payments.'],
  },
  {
    id: 'weather', name: 'National Weather Service', purpose: 'Project weather forecasts',
    description: 'Numerical temperature, precipitation, and wind forecasts inform the project weather panel and ABQ ADU trade guidance.',
    available: 'National Weather Service is the default weather source and requires no account or API credentials. Earlier records retain their original source.',
    steps: ['Select the project and choose Update forecast to retrieve current forecast data.', 'Review the forecast location, issue time, and any unknown values before planning exposed work.', 'If another weather provider is needed, select it in the private server settings and complete its setup.'],
  },
  {
    id: 'twilio', name: 'Twilio', purpose: 'Platform text delivery & inbox',
    description: 'Send texts from the platform and receive subcontractor quotes at a business number.',
    available: 'Use your phone’s text app to prepare bid requests. Replies reach the platform only when sent to its configured business number.',
    steps: ['Connect a Twilio account and an approved SMS sender number.', 'Set the public HTTPS inbound URL in Twilio and TWILIO_INBOUND_URL on the server, then restart.', 'Verify signed incoming messages and retry handling with an authorized test number before relying on crew coordination. Delivery tracking is not yet connected.'],
  },
  {
    id: 'ocr', name: 'OCR.space', purpose: 'Optional receipt scanning provider',
    description: 'An external scanning option for a separately configured receipt workflow.',
    available: 'Browser photo scanning does not need an OCR.space account. Pasted receipt text and manual entry are also available.',
    steps: ['Only add an OCR.space key if an external scanning fallback is needed.', 'A configured key alone does not enable a fallback button. Receipt photos are sent to OCR.space only through an explicitly selected provider workflow.', 'Review extracted text, vendor, date and total before saving a receipt.'],
  },
];

function WorkspaceAccess({ integrations, loading, error }) {
  const auth = !loading && !error ? integrations?.workspaceAuth : null;
  const mode = auth && typeof auth.configured === 'boolean' && ['admin', 'local', 'clerk'].includes(auth.mode) ? auth.mode : 'unknown';
  let title = loading ? 'Checking workspace access…' : 'Workspace access status unavailable';
  let detail = 'Refresh setup status to check the server’s selected sign-in mode.';
  if (mode === 'admin') {
    title = auth.configured ? 'Admin password · configured' : 'Admin password · setup needed';
    detail = 'The workspace uses its own admin password. Clerk is not required. Configuration does not replace a sign-in and access test.';
  } else if (mode === 'local') {
    title = auth.configured ? 'This computer only · local access' : 'This computer only · local setup unavailable';
    detail = 'Local access is restricted to a direct connection on this computer. Choose protected sign-in before hosting the private workspace.';
  } else if (mode === 'clerk') {
    title = auth.configured ? 'Clerk sign-in · configured; test sign-in' : 'Clerk sign-in · setup needed';
    detail = 'Clerk is the selected workspace sign-in method. Test approved, unapproved and signed-out access before sharing the private app.';
  }
  return <div className="integration-setup__access" data-auth-mode={mode}>
    <span className="integration-setup__eyebrow">Workspace access</span>
    <strong>{title}</strong><p>{detail}</p>
  </div>;
}

export default function IntegrationSetup({ integrations, loading, error, onRefresh, receiptScannerAvailable = false }) {
  return <section className="integration-setup" aria-labelledby="integration-setup-title">
    <p className="integration-setup__eyebrow">Built into your workspace</p>
    <h2 id="integration-setup-title">Your everyday tools</h2>
    <p className="integration-setup__intro">Checks, phone text drafts and receipt entry do not need outside service accounts.</p>
    <ul className="integration-setup__workflows" aria-label="Built-in workflows">
      <li><span className="integration-setup__number" aria-hidden="true">01</span><div><strong>Check tracking</strong><p>Create an invoice PDF, then record the check amount, date received and reference. Recording a check does not confirm bank clearance.</p><Link to="/invoices">Open invoices →</Link></div></li>
      <li><span className="integration-setup__number" aria-hidden="true">02</span><div><strong>Phone text drafts</strong><p>Prepare bid requests in your phone’s text app. Review and send there; replies stay on your phone.</p><Link to="/command-center#messages">Prepare a text →</Link></div></li>
      <li><span className="integration-setup__number" aria-hidden="true">03</span><div><strong>{receiptScannerAvailable ? 'Receipt photo scan' : 'Receipt entry'}</strong><p>{receiptScannerAvailable ? 'Read a receipt photo in this browser, then review the text, vendor, date and total before saving. No scanning account needed.' : 'Paste receipt text or enter details manually, then review the vendor, date and total before saving.'}</p><a href="#receipts">Open receipts →</a></div></li>
    </ul>
    <WorkspaceAccess integrations={integrations} loading={loading} error={error} />
    {error && <p className="integration-setup__error" role="alert">{error}</p>}
    <details className="integration-setup__optional">
    <summary><strong>Optional services &amp; weather</strong><span>Online payments, accounting, platform texts and forecast settings</span></summary>
    <p className="integration-setup__notice">This checks server settings only. Credentials do not prove a working connection.</p>
    {services.map(defaultService => {
      const appleSelected = defaultService.id === 'weather' && integrations?.weather?.provider === 'weatherkit';
      const service = appleSelected ? { ...defaultService, name: 'Apple Weather',
        description: 'Apple forecasts inform the project weather panel and ABQ ADU trade guidance.',
        available: 'Apple Weather is selected as the optional provider. Earlier records retain their original source.',
        steps: ['Enable WeatherKit in your Apple Developer account and create a Service ID and signing key.', 'Add the Team ID, Key ID, Service ID and private key to the server settings.', 'Map each project ZIP to its forecast coordinates and time zone, restart the server, then check weather.'],
      } : defaultService;
      const configured = integrations?.[service.id]?.configured;
      const status = error ? 'unavailable' : loading ? 'checking' : configured === true ? 'configured' : configured === false ? 'missing' : 'unavailable';
      const label = {configured:service.id === 'weather' && !appleSelected ? 'No credentials required · check forecast' : 'Credentials added · untested',missing:service.id === 'weather' ? 'Selected provider needs setup' : 'Optional · not configured',checking:'Checking settings…',unavailable:'Status unavailable'}[status];
      return <details key={service.id} className="integration-setup__service">
        <summary>
          <span className="integration-setup__service-title"><strong>{service.purpose}</strong><span>{service.name}</span></span>
          <span className="integration-setup__status" data-setup-status={status}>{label}</span>
        </summary>
        <div className="integration-setup__body">
          <p>{service.description}</p>
          <p className="integration-setup__available">{service.available}</p>
          <h3>Next steps</h3>
          <ol>{service.steps.map(step => <li key={step}>{step}</li>)}</ol>
        </div>
      </details>;
    })}
    </details>
    <button type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Checking settings…' : 'Refresh setup status'}</button>
  </section>;
}
