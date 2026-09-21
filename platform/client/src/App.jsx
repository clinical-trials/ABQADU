import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Portfolio from './pages/Portfolio';
import Scheduler from './pages/Scheduler';
import RiskRegister from './pages/RiskRegister';
import FieldOperations from './pages/FieldOperations';
import DesignStudio from './pages/DesignStudio';
import Clients from './pages/Clients';
import BidBuilder from './pages/BidBuilder';
import Invoices from './pages/Invoices';
import CommandCenter from './pages/CommandCenter';
import ProjectWorkspace from './components/ProjectWorkspace';
import AppNavigation from './components/AppNavigation';

function SchedulerRoute() {
  return <ProjectWorkspace section="schedule">{id => <Scheduler projectId={id} />}</ProjectWorkspace>;
}

function FieldRoute() {
  return <ProjectWorkspace section="field">{id => <FieldOperations projectId={id} />}</ProjectWorkspace>;
}

function RiskRoute() {
  return <ProjectWorkspace section="risks">{id => <RiskRegister projectId={id} />}</ProjectWorkspace>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppNavigation />
      <div>
        <Routes>
          <Route path="/"               element={<Portfolio />} />
          <Route path="/command-center"  element={<CommandCenter />} />
          <Route path="/clients"        element={<Clients />} />
          <Route path="/bids"           element={<BidBuilder />} />
          <Route path="/invoices"       element={<Invoices />} />
          <Route path="/schedule/:id?"   element={<SchedulerRoute />} />
          <Route path="/field/:id?"      element={<FieldRoute />} />
          <Route path="/risks/:id?"      element={<RiskRoute />} />
          <Route path="/design/:id"     element={<ProjectWorkspace section="design">{() => <DesignStudio />}</ProjectWorkspace>} />
          <Route path="/design"         element={<DesignStudio />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
