import type { Generation } from '../../types';
import { fileUrl } from '../../api';

export default function AudioViewer({ gen }: { gen: Generation }) {
  return <audio src={fileUrl(gen.id)} controls style={{ width: '100%' }} />;
}
