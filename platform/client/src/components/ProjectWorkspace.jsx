import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { requestJson, requestList } from '../utils/api';
import './ProjectWorkspace.css';

export default function ProjectWorkspace({ section, children }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError('');
    requestList('/api/portfolio').then(data => {
      if (active) setProjects(data);
    }).catch(error => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const project = id ? projects.find(item => String(item.id) === id) : null;
  async function createProject(event) {
    event.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true); setSaveError('');
    try {
      const created = await requestJson('/api/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!Number.isInteger(created?.id)) throw new Error('The server returned an invalid project. Reload before trying again.');
      setProjects(items => [...items, created]);
      setAdding(false); setName('');
      navigate(`/${section}/${created.id}`);
    } catch (error) { setSaveError(error.message); }
    finally { setSaving(false); }
  }

  return <>
    <section className="project-workspace" aria-label="Project workspace">
      <div className="project-workspace__selector">
        <label htmlFor="workspace-project">Working project</label>
        <select id="workspace-project" value={project ? String(project.id) : ''}
          disabled={loading || !!loadError || saving} onChange={event => navigate(`/${section}/${event.target.value}`)}>
          <option value="" disabled>Select a project</option>
          {projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        <button type="button" disabled={loading || !!loadError || saving} onClick={() => setAdding(value => !value)}>
          {adding ? 'Close new project' : '+ New project'}
        </button>
      </div>
      {loading && <p role="status">Loading projects…</p>}
      {loadError && <div role="alert"><p>{loadError}</p><button onClick={() => setAttempt(value => value + 1)}>Retry loading projects</button></div>}
      {!loading && !loadError && id && !project && <p role="alert">Project not found. Select an existing project or create one below.</p>}
      {!loading && !loadError && !id && projects.length > 0 && <p>Choose the project you want to work on.</p>}
      {!loading && !loadError && (adding || !projects.length) && <form onSubmit={createProject}>
        {!projects.length && <p>Create your first project to use scheduling, field tasks, and the risk register.</p>}
        <label htmlFor="workspace-name">Project name</label>
        <div className="project-workspace__create">
          <input id="workspace-name" required maxLength={200} placeholder="e.g. Maple Street ADU" value={name}
            disabled={saving} onChange={event => setName(event.target.value)} />
          <button type="submit" disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create project'}</button>
        </div>
        {saveError && <p role="alert">{saveError}</p>}
      </form>}
    </section>
    {!loading && !loadError && project && <React.Fragment key={project.id}>{children(project.id)}</React.Fragment>}
  </>;
}
