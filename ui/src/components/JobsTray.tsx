import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadActiveJobs, useActiveJobCount, useJobs, useServerEvents } from '../sse';

const LABEL = {
  queued: 'queued', running: 'running', done: 'ready', failed: 'failed',
  interrupted: 'interrupted', discarded: 'discarded',
} as const;

export default function JobsTray() {
  const jobs = useJobs();
  const active = useActiveJobCount();
  const [open, setOpen] = useState(false);
  useServerEvents();
  useEffect(() => { loadActiveJobs().catch(() => {}); }, []);

  return (
    <div className="jobs-tray" aria-label="Jobs">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Jobs{active > 0 && <span className="jobs-count"> ({active})</span>}
      </button>
      {open && (
        <ul className="jobs-panel">
          {jobs.length === 0 && <li>No jobs</li>}
          {jobs.map((j) => (
            <li key={j.id} data-status={j.status}>
              <span>{j.request.kind}</span> · <span>{j.request.model ?? 'auto'}</span> · <strong>{LABEL[j.status]}</strong>
              {j.error && <div className="jobs-error">{j.error.message}</div>}
              {j.status === 'done' && j.generationIds[0] && (
                <> · <Link to={`/asset/${j.generationIds[0]}`}>open</Link></>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
