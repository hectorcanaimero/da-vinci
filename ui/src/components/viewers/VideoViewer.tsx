import type { Generation } from '../../types';
import { fileUrl } from '../../api';

export default function VideoViewer({ gen }: { gen: Generation }) {
  return <video src={fileUrl(gen.id)} controls style={{ maxWidth: '100%', maxHeight: '80vh' }} />;
}
