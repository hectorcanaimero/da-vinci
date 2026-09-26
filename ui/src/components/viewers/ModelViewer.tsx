import { createElement, useEffect, useState } from 'react';
import type { Generation } from '../../types';
import { fileUrl } from '../../api';

export default function ModelViewer({ gen }: { gen: Generation }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Dynamic import keeps model-viewer out of the main chunk.
    import('@google/model-viewer').then(() => setReady(true));
  }, []);
  if (!ready) return <p>Cargando visor 3D…</p>;
  return createElement('model-viewer', {
    src: fileUrl(gen.id),
    'camera-controls': true,
    'auto-rotate': true,
    style: { width: '100%', height: '70vh' },
  });
}
