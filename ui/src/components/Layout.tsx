import { NavLink, Outlet } from 'react-router-dom';
import JobsTray from './JobsTray';

const links = [
  { to: '/', label: 'Library', end: true },
  { to: '/studio', label: 'Studio' },
  { to: '/providers', label: 'Providers' },
  { to: '/spend', label: 'Spend' },
];

export default function Layout() {
  return (
    <div className="layout">
      <nav className="nav" aria-label="Main">
        <strong className="brand">Da Vinci</strong>
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.end}>
            {l.label}
          </NavLink>
        ))}
      </nav>
      <main className="main">
        <Outlet />
      </main>
      <JobsTray />
    </div>
  );
}
