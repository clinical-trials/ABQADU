import React from 'react';
import './IntegrationSetup.css';

export const SERVICE_IDS = ['clerk', 'invoiceshelf', 'stripe', 'weatherkit', 'twilio', 'ocr'];
const services = [
  {
    id: 'clerk', name: 'Clerk', purpose: 'Private sign-in',
    description: 'Control who can see projects, customer details, and money.',
    available: 'Project data requires a verified Clerk session and an approved staff account.',
    steps: ['Add your Clerk application settings and allowed staff user IDs to the private server configuration.', 'Set the allowed app addresses, then restart the server and sign in.', 'Test that signed-out and unapproved accounts cannot open project data or trigger payments and texts.'],
  },
  {
    id: 'invoiceshelf', name: 'InvoiceShelf', purpose: 'Estimates & invoice portal',
    description: 'Give clients an online place to review estimates and invoices.',
    available: 'Client packets and local invoice drafts work without InvoiceShelf.',
    steps: ['Set up an InvoiceShelf company with USD currency and connect its server address, company ID, and access token.', 'Create the InvoiceShelf customer from Clients, then create its invoice from Invoices.', 'Check the remote invoice and amount. If creation needs review, reconcile the remote record before retrying. Stripe payments are recorded locally; InvoiceShelf payment synchronization is separate.'],
  },
  {
    id: 'stripe', name: 'Stripe', purpose: 'Online payments',
    description: 'Create a checkout link for a saved invoice’s outstanding balance.',
    available: 'Estimate and invoice preparation do not require online payments.',
    steps: ['Connect your Stripe test account, return pages, and signed webhook endpoint.', 'Import saved Command Center invoice drafts, then create a payment link from Invoices.', 'Complete a test payment and confirm the invoice balance updates once before enabling live payments.'],
  },
  {
    id: 'weatherkit', name: 'Apple Weather', purpose: 'Project weather forecasts',
    description: 'Apple forecasts inform the project weather panel and ABQ ADU construction-risk estimates.',
    available: 'Earlier weather records stay available with their original source. New forecasts require WeatherKit setup.',
    steps: ['Enable WeatherKit in your Apple Developer account and create a Service ID and signing key.', 'Add the Team ID, Key ID, Service ID and private key to the server settings.', 'Map each project ZIP to its forecast coordinates and time zone, restart the server, then check weather.'],
  },
  {
    id: 'twilio', name: 'Twilio', purpose: 'Business text messages',
    description: 'Send project updates directly from the builder app.',
    available: 'Use your phone’s text app with the existing Text button.',
    steps: ['Connect a Twilio account and an approved SMS sender number.', 'Complete the sender setup required by Twilio, then test with an authorized recipient.', 'Add delivery updates and reply handling before depending on texts for crew coordination.'],
  },
  {
    id: 'ocr', name: 'OCR.space', purpose: 'Receipt photo scanning',
    description: 'Read receipt photos to suggest a vendor, date, and amount.',
    available: 'Pasted receipt text works now, and receipts can also be entered manually.',
    steps: ['Add an OCR.space access key to the server.', 'Add a receipt photo upload or camera option; the current screen accepts pasted text.', 'Test photos and review the extracted vendor, date, and total before relying on the record.'],
  },
];

export default function IntegrationSetup({ integrations, loading, error, onRefresh }) {
  return <section className="integration-setup" aria-labelledby="integration-setup-title">
    <p className="integration-setup__eyebrow">Builder setup</p>
    <h2 id="integration-setup-title">Set up services</h2>
    <p className="integration-setup__intro">Continue estimates and receipt entry while these services are set up. Open a service below for its next steps.</p>
    <p className="integration-setup__notice">This checks server settings only. Credentials do not prove a working connection.</p>
    {error && <p className="integration-setup__error" role="alert">{error}</p>}
    {services.map(service => {
      const configured = integrations?.[service.id]?.configured;
      const status = error ? 'unavailable' : loading ? 'checking' : configured === true ? 'configured' : configured === false ? 'missing' : 'unavailable';
      const label = {configured:'Credentials added · untested',missing:'Setup needed',checking:'Checking settings…',unavailable:'Status unavailable'}[status];
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
    <p className="integration-setup__priority"><strong>Verify sign-in first</strong>, then test invoices and payment recording with your accounts. Texting and photo scanning can follow.</p>
    <button type="button" onClick={onRefresh} disabled={loading}>{loading ? 'Checking settings…' : 'Refresh setup status'}</button>
  </section>;
}
