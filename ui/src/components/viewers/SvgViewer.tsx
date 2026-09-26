import type { Generation } from '../../types';
import { fileUrl } from '../../api';

const checker = 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 20px 20px';

export default function SvgViewer({ gen }: { gen: Generation }) {
  return (
    <div style={{ background: checker, textAlign: 'center' }}>
      <img src={fileUrl(gen.id)} alt={gen.prompt ?? gen.id} style={{ maxWidth: '100%', maxHeight: '80vh' }} />
    </div>
  );
}
