import { useState } from 'react';
import type { Generation } from '../../types';
import { fileUrl } from '../../api';

export default function ImageViewer({ gen }: { gen: Generation }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <div style={{ overflow: 'auto', maxHeight: '80vh', textAlign: 'center' }}>
      <img
        src={fileUrl(gen.id)}
        alt={gen.prompt ?? gen.id}
        onClick={() => setZoomed((z) => !z)}
        style={zoomed
          ? { cursor: 'zoom-out', maxWidth: 'none' }
          : { cursor: 'zoom-in', maxWidth: '100%', maxHeight: '80vh' }}
      />
    </div>
  );
}
