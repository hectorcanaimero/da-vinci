import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

// Matches Titlebar.tsx's HEIGHT (F1.5.T1) — Layout sits below it in the
// document, not inside it, so the two can't share the constant directly.
const TITLEBAR_HEIGHT = 38;

export default function Layout() {
  return (
    <div style={{ display: 'flex', height: `calc(100vh - ${TITLEBAR_HEIGHT}px)`, overflow: 'hidden' }}>
      <Sidebar />
      <main style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--bg-app)', color: 'var(--text-primary)' }}>
        <Outlet />
      </main>
    </div>
  );
}
