import React from 'react';
import './AuthBoundary.css';

export default function PaymentReturn({ search = window.location.search }) {
  const cancelled = new URLSearchParams(search).get('result') === 'cancelled';
  return <main className="auth-screen"><section className="auth-card">
    <div className="auth-brand">ABQ <span>ADU</span></div>
    <h1>{cancelled ? 'Checkout closed' : 'Check your payment confirmation'}</h1>
    <p>Your builder receives confirmation directly from Stripe. Closing this page will not interrupt that process.</p>
    <p>If you have a question about your invoice, contact your builder.</p>
  </section></main>;
}
