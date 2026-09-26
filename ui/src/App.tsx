import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Library from './pages/Library';
import Asset from './pages/Asset';
import Studio from './pages/Studio';
import Providers from './pages/Providers';
import Spend from './pages/Spend';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Library />} />
        <Route path="asset/:id" element={<Asset />} />
        <Route path="studio" element={<Studio />} />
        <Route path="providers" element={<Providers />} />
        <Route path="spend" element={<Spend />} />
        <Route path="*" element={<Library />} />
      </Route>
    </Routes>
  );
}
