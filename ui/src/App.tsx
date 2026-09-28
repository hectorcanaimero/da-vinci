import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { listProviders } from './api';
import ApiKeyGate from './components/ApiKeyGate';
import CommandPalette from './components/CommandPalette';
import Layout from './components/Layout';
import Titlebar from './components/Titlebar';
import Asset from './pages/Asset';
import Library from './pages/Library';
import Onboarding from './pages/Onboarding';
import Studio from './pages/Studio';

const ONBOARDED_KEY = 'reveron.onboarded';

// Sin ningún proveedor conectado y con el asistente nunca terminado ni
// salteado → es la primera vez (FR-6).
function useNeedsOnboarding() {
  const [needs, setNeeds] = useState<boolean | null>(null);
  useEffect(() => {
    if (localStorage.getItem(ONBOARDED_KEY)) {
      setNeeds(false);
      return;
    }
    listProviders()
      .then(({ items }) => setNeeds(!items.some((p) => p.status === 'connected')))
      .catch(() => setNeeds(false));
  }, []);
  return needs;
}

// ponytail: las pantallas reales aterrizan fase por fase — Chat (F5),
// Actividad (F6.2) y Ajustes (F6.4) todavía muestran sólo su título.
function Placeholder({ title }: { title: string }) {
  return (
    <div style={{ padding: 32 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)', margin: 0 }}>{title}</h1>
    </div>
  );
}

export default function App() {
  const needsOnboarding = useNeedsOnboarding();

  return (
    <>
      <Titlebar />
      <CommandPalette />
      <ApiKeyGate>
        {needsOnboarding ? (
          <Onboarding onDone={() => localStorage.setItem(ONBOARDED_KEY, '1')} />
        ) : needsOnboarding === false ? (
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Placeholder title="Chat" />} />
              <Route path="estudio" element={<Studio />} />
              <Route path="galeria" element={<Library />} />
              <Route path="actividad" element={<Placeholder title="Actividad" />} />
              <Route path="asset/:id" element={<Asset />} />
              <Route path="gastos" element={<Placeholder title="Gastos" />} />
              <Route path="ajustes" element={<Placeholder title="Ajustes" />} />
              <Route path="*" element={<Placeholder title="Chat" />} />
            </Route>
          </Routes>
        ) : null}
      </ApiKeyGate>
    </>
  );
}
