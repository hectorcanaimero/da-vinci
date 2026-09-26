import { lazy, Suspense } from 'react';
import type { Generation } from '../../types';
import ImageViewer from './ImageViewer';
import SvgViewer from './SvgViewer';
import VideoViewer from './VideoViewer';
import AudioViewer from './AudioViewer';

const ModelViewer = lazy(() => import('./ModelViewer'));

export default function AssetViewer({ gen }: { gen: Generation }) {
  const { kind, mime } = gen;
  if (kind === 'svg' || mime === 'image/svg+xml') return <SvgViewer gen={gen} />;
  if (kind === 'model-3d' || mime.startsWith('model/')) {
    return <Suspense fallback={<p>Cargando visor 3D…</p>}><ModelViewer gen={gen} /></Suspense>;
  }
  if (mime.startsWith('video/')) return <VideoViewer gen={gen} />;
  if (mime.startsWith('audio/')) return <AudioViewer gen={gen} />;
  if (mime.startsWith('image/')) return <ImageViewer gen={gen} />;
  return <a href={gen.url}>Descargar ({mime})</a>;
}
