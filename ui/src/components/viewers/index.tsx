import type { CSSProperties } from 'react';
import { lazy, Suspense } from 'react';
import type { Generation } from '../../types';
import ImageViewer from './ImageViewer';
import SvgViewer from './SvgViewer';
import VideoViewer from './VideoViewer';
import AudioViewer from './AudioViewer';

const ModelViewer = lazy(() => import('./ModelViewer'));

const stage: CSSProperties = {
  height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 24, background: 'var(--bg-app)',
};

function pick(gen: Generation) {
  const { kind, mime } = gen;
  if (kind === 'svg' || mime === 'image/svg+xml') return <SvgViewer gen={gen} />;
  if (kind === 'model-3d' || mime.startsWith('model/')) {
    return <Suspense fallback={<p style={{ color: 'var(--text-muted)' }}>Cargando visor 3D…</p>}><ModelViewer gen={gen} /></Suspense>;
  }
  if (mime.startsWith('video/')) return <VideoViewer gen={gen} />;
  if (mime.startsWith('audio/')) return <AudioViewer gen={gen} />;
  if (mime.startsWith('image/')) return <ImageViewer gen={gen} />;
  return <a href={gen.url} style={{ color: 'var(--accent)' }}>Descargar ({mime})</a>;
}

// Restyles the container that hosts each per-type viewer (already built and
// left as-is); the viewers themselves aren't rewritten here.
export default function AssetViewer({ gen }: { gen: Generation }) {
  return <div style={stage}>{pick(gen)}</div>;
}
