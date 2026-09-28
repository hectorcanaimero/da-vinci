import { Route, Routes } from 'react-router-dom';
import ApiKeyGate from './components/ApiKeyGate';
import CommandPalette from './components/CommandPalette';
import Layout from './components/Layout';
import Titlebar from './components/Titlebar';
import Library from './pages/Library';
import Settings from './pages/Settings';

// ponytail: real screens land phase by phase (F3 Estudio, F4 Galería, F5
// Chat, F6 Actividad...) — for now every destination is just its title.
function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', margin: 0 }}>{title}</h1>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Titlebar />
      <CommandPalette />
      <ApiKeyGate>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Placeholder title="Chat" />} />
            <Route path="estudio" element={<Placeholder title="Estudio" />} />
            <Route path="galeria" element={<Library />} />
            <Route path="actividad" element={<Placeholder title="Actividad" />} />
            <Route path="gastos" element={<Placeholder title="Gastos" />} />
            <Route path="ajustes" element={<Settings />} />
            <Route path="*" element={<Placeholder title="Chat" />} />
          </Route>
        </Routes>
      </ApiKeyGate>
    </>
  );
}
