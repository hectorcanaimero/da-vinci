import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fileUrl, setFavorite } from '../../api';
import type { Generation } from '../../types';

const ICON: Record<string, string> = { audio: '🎵', sfx: '🔊', 'model-3d': '🧊' };

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 31536e6], ['month', 2592e6], ['day', 864e5], ['hour', 36e5], ['minute', 6e4],
];
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
export function relTime(iso: string) {
  const d = new Date(iso).getTime() - Date.now();
  for (const [u, ms] of UNITS) if (Math.abs(d) >= ms) return rtf.format(Math.round(d / ms), u);
  return rtf.format(0, 'second');
}

export default function Card({ g, onFav }: { g: Generation; onFav: (id: string, fav: boolean) => void }) {
  const nav = useNavigate();
  const vid = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const src = fileUrl(g.id);
  const audio = g.kind === 'audio' || g.kind === 'sfx';

  const toggleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onFav(g.id, !g.favorite); // optimistic
    try { await setFavorite(g.id, !g.favorite); } catch { onFav(g.id, g.favorite); }
  };

  let media;
  if (g.kind === 'video' || g.kind === 'avatar-video') {
    media = (
      <video ref={vid} src={src} preload="metadata" muted loop playsInline
        onMouseEnter={() => vid.current?.play().catch(() => {})}
        onMouseLeave={() => { vid.current?.pause(); }} />
    );
  } else if (audio) {
    media = playing
      ? <audio src={src} controls autoPlay onClick={(e) => e.stopPropagation()} />
      : <button className="lib-icon" aria-label="Play" onClick={(e) => { e.stopPropagation(); setPlaying(true); }}>{ICON[g.kind]}</button>;
  } else if (g.kind === 'model-3d') {
    media = <span className="lib-icon">{ICON[g.kind]}</span>;
  } else {
    media = <img src={src} loading="lazy" alt={g.prompt ?? g.kind} />;
  }

  return (
    <article className="lib-card" tabIndex={0} onClick={() => nav(`/asset/${g.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) nav(`/asset/${g.id}`); }}>
      <div className="lib-media">{media}</div>
      <button className={`lib-star${g.favorite ? ' on' : ''}`} aria-pressed={g.favorite}
        aria-label={g.favorite ? 'Remove favorite' : 'Add favorite'} onClick={toggleFav}>
        {g.favorite ? '★' : '☆'}
      </button>
      <div className="lib-meta">
        <p className="lib-prompt" title={g.prompt ?? ''}>{g.prompt ?? '(no prompt)'}</p>
        <p className="lib-sub"><span>{g.model}</span><span>${g.costUsd.toFixed(2)}</span><span>{relTime(g.createdAt)}</span></p>
      </div>
    </article>
  );
}
