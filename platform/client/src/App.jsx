import React from 'react';
import { BrowserRouter, Routes, Route, Link, useParams } from 'react-router-dom';
import Portfolio from './pages/Portfolio';
import Scheduler from './pages/Scheduler';
import RiskRegister from './pages/RiskRegister';
import FieldOperations from './pages/FieldOperations';
import DesignStudio from './pages/DesignStudio';
import Clients from './pages/Clients';
import BidBuilder from './pages/BidBuilder';
import Invoices from './pages/Invoices';

function Nav() {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, height: 52, zIndex: 100,
      background: 'rgba(28,25,23,.95)', backdropFilter: 'blur(10px)',
      display: 'flex', alignItems: 'center', padding: '0 24px', gap: 32,
      borderBottom: '1px solid rgba(255,255,255,.06)',
    }}>
      <span style={{ fontFamily: 'Barlow Condensed, sans-serif', fontWeight: 900,
        fontSize: 20, color: '#F0EBE1', letterSpacing: '.03em' }}>
        ABQ <span style={{ color: '#C4954A' }}>ADU</span>
      </span>
      {[
        { to: '/', label: 'Portfolio' },
        { to: '/clients', label: 'Clients' },
        { to: '/bids', label: 'Bids' },
        { to: '/invoices', label: 'Invoices' },
        { to: '/schedule/1', label: 'Schedule' },
        { to: '/field/1', label: 'Field Ops' },
        { to: '/risks/1', label: 'Risks' },
        { to: '/design/1', label: 'Design' },
      ].map(link => (
        <Link key={link.to} to={link.to} style={{
          fontSize: 13, fontWeight: 500, letterSpacing: '.04em',
          textTransform: 'uppercase', color: '#A8A29E', textDecoration: 'none',
          transition: 'color .15s',
        }}
        onMouseEnter={e => e.target.style.color = '#C4954A'}
        onMouseLeave={e => e.target.style.color = '#A8A29E'}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}

function SchedulerRoute() {
  const { id } = useParams();
  return <Scheduler projectId={parseInt(id)} />;
}

function FieldRoute() {
  const { id } = useParams();
  return <FieldOperations projectId={parseInt(id)} />;
}

function RiskRoute() {
  const { id } = useParams();
  return <RiskRegister projectId={parseInt(id)} />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <div style={{ paddingTop: 52 }}>
        <Routes>
          <Route path="/"               element={<Portfolio />} />
          <Route path="/clients"        element={<Clients />} />
          <Route path="/bids"           element={<BidBuilder />} />
          <Route path="/invoices"       element={<Invoices />} />
          <Route path="/schedule/:id"   element={<SchedulerRoute />} />
          <Route path="/field/:id"      element={<FieldRoute />} />
          <Route path="/risks/:id"      element={<RiskRoute />} />
          <Route path="/design/:id"     element={<DesignStudio />} />
          <Route path="/design"         element={<DesignStudio />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
