import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteGeneration, fileUrl, getGeneration, setFavorite } from '../../api';
import AssetViewer from '../../components/viewers/AssetViewer';
import { useServerEvents } from '../../sse';
import type { Generation } from '../../types';
import Lineage from './Lineage';
import Actions from './Actions';

type Detail = Generation & { parents: Generation[]; children: Generation[] };

const copy = (s: string) => navigator.clipboard?.writeText(s).catch(() => {});

export default function Asset() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [alsoFile, setAlsoFile] = useState(false);

  const load = useCallback(() => {
    getGeneration(id).then((r) => { setD(r); setErr(null); }).catch((e) => setErr(e.message));
  }, [id]);
  useEffect(() => { setD(null); setConfirming(false); load(); }, [load]);

  // SSE callbacks are bound once; go through a ref to see the current page.
  const ref = useRef({ d, load });
  ref.current = { d, load };
  useServerEvents(
    (g) => { if (g.inputs.some((i) => i.id === ref.current.d?.id)) ref.current.load(); },
    (gone) => {
      const c = ref.current.d;
      if (c && c.parents.concat(c.children).some((x) => x.id === gone)) ref.current.load();
    },
  );

  if (err) return <p>Error: {err}</p>;
  if (!d) return <p>Cargando…</p>;

  const toggleFav = () => setFavorite(d.id, !d.favorite).then((g) => setD({ ...d, favorite: g.favorite }));
  const remove = () => deleteGeneration(d.id, alsoFile).then(() => nav('/')).catch((e) => setErr(e.message));

  return (
    <div>
      <AssetViewer gen={d} />
      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        <button onClick={toggleFav}>{d.favorite ? '★ Favorito' : '☆ Favorito'}</button>
        <a href={fileUrl(d.id)} download><button>Descargar</button></a>
        <button onClick={() => setConfirming(true)}>Borrar</button>
      </div>
      {confirming && (
        <dialog open>
          <p>¿Borrar esta generación?</p>
          <label>
            <input type="checkbox" checked={alsoFile} onChange={(e) => setAlsoFile(e.target.checked)} /> Borrar también el archivo
          </label>
          <div><button onClick={remove}>Borrar</button> <button onClick={() => setConfirming(false)}>Cancelar</button></div>
        </dialog>
      )}
      <Actions gen={d} />
      <h3>Prompt</h3>
      <p style={{ whiteSpace: 'pre-wrap' }}>{d.prompt ?? '—'}</p>
      {d.prompt && <button onClick={() => copy(d.prompt!)}>Copiar prompt</button>}
      <dl>
        <dt>Modelo</dt>
        <dd>{d.provider}/{d.model}{d.requestedModel && d.requestedModel !== d.model && ` (pedido: ${d.requestedModel})`}</dd>
        <dt>Parámetros</dt><dd><pre>{JSON.stringify(d.params, null, 2)}</pre></dd>
        <dt>Costo estimado</dt><dd>${d.costUsd.toFixed(4)}</dd>
        <dt>Fecha</dt><dd>{new Date(d.createdAt).toLocaleString()}</dd>
        <dt>Origen</dt><dd>{d.source}</dd>
        <dt>Proyecto</dt><dd>{d.projectDir ?? '—'}</dd>
        <dt>Archivo</dt><dd><code>{d.filePath}</code> <button onClick={() => copy(d.filePath)}>Copiar ruta</button></dd>
      </dl>
      <Lineage gen={d} parents={d.parents} children={d.children} />
    </div>
  );
}
