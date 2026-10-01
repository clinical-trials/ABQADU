import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { WorkspaceSignOut } from './AuthBoundary';
import { revealWorkspaceSection } from '../utils/workspaceNavigation';
import './AppNavigation.css';

const workflow = [
  ['/command-center#project-intake', 'Intake'], ['/command-center#gis-review', 'Site review'],
  ['/cost-estimator', 'Estimate'], ['/preconstruction', 'Agreement'], ['/schedule', 'Build'], ['/invoices', 'Invoices'],
];
const groups = [
  ['Job tools', [['/command-center', 'Job overview'], ['/clients', 'Clients'], ['/bids', 'Saved customer estimates'], ['/command-center#trade-bids', 'Trade bids'], ['/design', 'Design studio'], ['/field', 'Field operations'], ['/risks', 'Risks']]],
  ['Office & company', [['/command-center#receipts', 'Receipts'], ['/command-center#project-helper', 'Weekly briefing'], ['/command-center#document-activity', 'Document activity'], ['/command-center#contractor-phonebook', 'Contractor phone book'], ['/executive', 'Executive team & CFO'], ['/executive#owner-plan', 'Business plan & goals'], ['/executive#preconstruction-cycle', 'Contract-to-$10k scorecard'], ['/portfolio', 'Portfolio'], ['/command-center#service-setup', 'Optional services']]],
];
export default function AppNavigation() {
  const [expanded, setExpanded] = useState(false);
  const location = useLocation();
  const menuButton = useRef(null);
  useEffect(() => { setExpanded(false); revealWorkspaceSection(location.hash); }, [location.pathname, location.hash]);
  useEffect(() => {
    const close = event => { if (event.key === 'Escape' && expanded) { setExpanded(false); menuButton.current?.focus(); } };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [expanded]);
  const current = to => (to.includes('#') ? location.pathname + location.hash === to : location.pathname === to && !location.hash) ? 'page' : undefined;
  const navigate = to => { setExpanded(false); if (location.pathname + location.hash === to) revealWorkspaceSection(location.hash); };
  return <header className="app-navigation">
    <nav aria-label="Quick tools" className="app-navigation-bar">
      <Link className="app-wordmark" to="/command-center" aria-label="ABQ ADU jobs">ABQ <span>ADU</span></Link>
      <div className="app-primary-links">
        {[['/command-center#messages','Messages'],['/command-center#contractor-phonebook','Contacts']].map(([to,label]) => <Link key={to} to={to} onClick={() => navigate(to)} aria-current={current(to)}>{label}</Link>)}
      </div>
      <button ref={menuButton} className="app-menu-button" aria-expanded={expanded} aria-controls="workspace-menu" onClick={() => setExpanded(value=>!value)} aria-label={expanded ? 'Close workspace menu' : 'Open workspace menu'}><span aria-hidden="true">{expanded ? '×' : '☰'}</span><span className="app-menu-label">Menu</span></button>
    </nav>
    <nav className="app-workflow" aria-label="Job workflow">
      {workflow.map(([to,label], index) => <Link key={to} to={to} onClick={() => navigate(to)} aria-current={current(to)}><span className="app-workflow-number" aria-hidden="true">0{index + 1} </span>{label}</Link>)}
    </nav>
    {expanded && <nav id="workspace-menu" aria-label="More workspace tools" className="app-workspace-menu">
      {groups.map(([title, links]) => <div className="app-menu-group" key={title}><h2>{title}</h2>{links.map(([to,label]) => <Link key={to} to={to} onClick={() => navigate(to)}>{label}</Link>)}</div>)}
      <div className="app-menu-footer"><a href="/">Homeowner website</a><WorkspaceSignOut /></div>
    </nav>}
  </header>;
}
