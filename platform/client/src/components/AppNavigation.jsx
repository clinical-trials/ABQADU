import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WorkspaceSignOut } from './AuthBoundary';
import './AppNavigation.css';

export default function AppNavigation() {
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();
  const menuButton = useRef(null);
  useEffect(() => {
    setExpanded(false);
    if (['#messages', '#trade-bids'].includes(location.hash)) document.getElementById(location.hash.slice(1))?.scrollIntoView?.({ behavior: 'smooth' });
  }, [location.pathname, location.hash]);
  useEffect(() => {
    const close = event => { if (event.key === 'Escape' && expanded) { setExpanded(false); menuButton.current?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [expanded]);
  return <header className="app-navigation">
    <nav aria-label="Main navigation" className="app-navigation-bar">
      <Link className="app-wordmark" to="/command-center" aria-label="ABQ ADU jobs">ABQ <span>ADU</span></Link>
      <div className="app-primary-links">
        {[['/command-center','Jobs'],['/command-center#trade-bids','Bids'],['/command-center#messages','Messages']].map(([to,label]) => <Link key={to} to={to} aria-current={location.pathname + location.hash === to ? 'page' : undefined}>{label}</Link>)}
      </div>
      <button ref={menuButton} className="app-menu-button" aria-expanded={expanded} aria-controls="workspace-menu" onClick={() => setExpanded(value=>!value)} aria-label={expanded ? 'Close workspace menu' : 'Open workspace menu'}><span aria-hidden="true">{expanded ? '×' : '☰'}</span><span className="app-menu-label">Menu</span></button>
    </nav>
    {expanded && <nav id="workspace-menu" aria-label="More workspace tools" className="app-workspace-menu">
      {[['/','Portfolio'],['/clients','Clients'],['/bids','Customer estimates'],['/invoices','Invoices & payments'],['/schedule','Schedule'],['/field','Field operations'],['/risks','Risks'],['/design','Design studio']].map(([to,label])=><Link key={to} to={to}>{label}</Link>)}
      <WorkspaceSignOut />
    </nav>}
  </header>;
}
