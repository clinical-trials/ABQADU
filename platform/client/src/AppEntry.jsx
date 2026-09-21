import React from 'react';
import App from './App';
import AuthBoundary from './components/AuthBoundary';
import PaymentReturn from './components/PaymentReturn';

export default function AppEntry({ pathname = window.location.pathname, search = window.location.search }) {
  if (pathname.replace(/\/$/, '') === '/payment-return') return <PaymentReturn search={search} />;
  return <AuthBoundary><App /></AuthBoundary>;
}
