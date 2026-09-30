import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requestJson, requestList } from '../utils/api';
import { apiFetch, assertAuthSession, getAuthSession, isAuthSessionCurrent, subscribeAuthSession } from '../utils/authFetch';
import './ProjectWorkspace.css';

export default function ProjectWorkspace({ section, children }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [owner] = useState(getAuthSession);
  useSyncExternalStore(subscribeAuthSession, getAuthSession);
  const currentSession = isAuthSessionCurrent(owner);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [exact, setExact] = useState({ id: null, project: null, loading: false, error: '', missing: false });
  const [lookupAttempt, setLookupAttempt] = useState(0);
  const currentId = useRef(id); currentId.current = id;
  const mounted = useRef(true);
  const creation = useRef(null);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; creation.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError('');
    requestList('/api/portfolio', { signal: controller.signal, authSession: owner }).then(data => {
      if (!controller.signal.aborted && isAuthSessionCurrent(owner)) setProjects(data);
    }).catch(error => { if (!controller.signal.aborted && isAuthSessionCurrent(owner)) setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted && isAuthSessionCurrent(owner)) setLoading(false); });
    return () => controller.abort();
  }, [attempt, owner]);

  const listedProject = id ? projects.find(item => String(item.id) === id) : null;
  useEffect(() => {
    if (!id || listedProject || loading || loadError || !currentSession) return;
    if (!/^[1-9]\d*$/.test(id) || Number(id) > 2147483647) {
      setExact({ id, project: null, loading: false, error: '', missing: true });
      return;
    }
    const controller = new AbortController();
    setExact({ id, project: null, loading: true, error: '', missing: false });
    const active = () => !controller.signal.aborted && currentId.current === id && isAuthSessionCurrent(owner);
    (async () => {
      try {
        const response = await apiFetch(`/api/portfolio/${encodeURIComponent(id)}`, { signal: controller.signal, authSession: owner });
        if (response.status === 404) {
          if (active()) setExact({ id, project: null, loading: false, error: '', missing: true });
          return;
        }
        const payload = await response.json();
        assertAuthSession(owner);
        if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'This project could not be loaded. Please retry.');
        if (!payload?.project || String(payload.project.id) !== id || typeof payload.project.name !== 'string') {
          throw new Error('The server returned a different or incomplete project. Please retry.');
        }
        if (active()) setExact({ id, project: payload.project, loading: false, error: '', missing: false });
      } catch (error) {
        if (active()) setExact({ id, project: null, loading: false, error: error.message || 'This project could not be loaded. Please retry.', missing: false });
      }
    })();
    return () => controller.abort();
  }, [id, listedProject, loading, loadError, lookupAttempt, owner, currentSession]);

  const project = listedProject || (exact.id === id ? exact.project : null);
  const lookingUp = Boolean(id && !listedProject && !loadError && (loading || exact.id !== id || exact.loading));
  const lookupError = !listedProject && exact.id === id ? exact.error : '';
  const missing = Boolean(id && !listedProject && exact.id === id && exact.missing);
  const available = !loading && !loadError && !lookingUp && !lookupError && (!id || Boolean(project));
  const choices = project && !listedProject ? [...projects, project] : projects;
  async function createProject(event) {
    event.preventDefault();
    if (!name.trim() || saving || !available || !currentSession) return;
    const controller = new AbortController();
    creation.current = controller;
    const routeAtStart = id;
    const active = () => mounted.current && !controller.signal.aborted && currentId.current === routeAtStart && isAuthSessionCurrent(owner);
    setSaving(true); setSaveError('');
    try {
      const created = await requestJson('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }), signal: controller.signal, authSession: owner,
      });
      if (!Number.isInteger(created?.id)) throw new Error('The server returned an invalid project. Reload before trying again.');
      if (!active()) return;
      setProjects(items => [...items, created]);
      setAdding(false); setName('');
      navigate(`/${section}/${created.id}`);
    } catch (error) { if (active()) setSaveError(error.message); }
    finally { if (mounted.current && isAuthSessionCurrent(owner)) setSaving(false); }
  }

  if (!currentSession) return null;
  return <>
    <section className="project-workspace" aria-label="Project workspace">
      <div className="project-workspace__selector">
        <label htmlFor="workspace-project">Working project</label>
        <select id="workspace-project" value={project ? String(project.id) : ''}
          disabled={loading || !!loadError || saving} onChange={event => navigate(`/${section}/${event.target.value}`)}>
          <option value="" disabled>Select a project</option>
          {choices.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button type="button" disabled={!available || saving} onClick={() => setAdding(value => !value)}>
          {adding ? 'Close new project' : '+ New project'}
        </button>
      </div>
      {loading && <p role="status">Loading projects…</p>}
      {!loading && lookingUp && <p role="status">Loading the linked project…</p>}
      {loadError && <div role="alert"><p>{loadError}</p><button onClick={() => setAttempt(value => value + 1)}>Retry loading projects</button></div>}
      {!loading && !loadError && lookupError && <div role="alert"><p>{lookupError}</p><button onClick={() => setLookupAttempt(value => value + 1)}>Retry loading project</button></div>}
      {!loading && !loadError && missing && <p role="alert">Project not found. Select an existing project, or return to the project list.</p>}
      {available && project?.status && <p>Project status: {project.status}</p>}
      {!loading && !loadError && !id && projects.length > 0 && <p>Choose the project you want to work on.</p>}
      {available && (adding || (!id && !projects.length)) && <form onSubmit={createProject}>
        {!id && !projects.length && <p>Create your first project to use scheduling, field tasks, and the risk register.</p>}
        <label htmlFor="workspace-name">Project name</label>
        <div className="project-workspace__create">
          <input id="workspace-name" required maxLength={200} placeholder="e.g. Maple Street ADU" value={name}
            disabled={saving} onChange={event => setName(event.target.value)} />
          <button type="submit" disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create project'}</button>
        </div>
        {saveError && <p role="alert">{saveError}</p>}
      </form>}
    </section>
    {available && project && <React.Fragment key={project.id}>{children(project.id)}</React.Fragment>}
  </>;
}
