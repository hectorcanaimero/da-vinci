import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import Activity from './pages/Activity';
import { listProviders } from './api';
import ApiKeyGate from './components/ApiKeyGate';
import CommandPalette from './components/CommandPalette';
import Layout from './components/Layout';
import Titlebar from './components/Titlebar';
import Asset from './pages/Asset';
import Chat from './pages/Chat';
import Library from './pages/Library';
import Onboarding from './pages/Onboarding';
import Settings from './pages/Settings';
import Spend from './pages/Spend';
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
              <Route index element={<Chat />} />
              <Route path="estudio" element={<Studio />} />
              <Route path="galeria" element={<Library />} />
              <Route path="actividad" element={<Activity />} />
              <Route path="asset/:id" element={<Asset />} />
              <Route path="gastos" element={<Spend />} />
              <Route path="ajustes" element={<Settings />} />
              <Route path="*" element={<Chat />} />
            </Route>
          </Routes>
        ) : null}
      </ApiKeyGate>
    </>
  );
}
