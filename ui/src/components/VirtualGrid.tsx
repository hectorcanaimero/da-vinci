import {
  cloneElement, useCallback, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactElement, type ReactNode,
} from 'react';

// ponytail: no react-window/react-virtual — a single IntersectionObserver over
// lightweight, always-mounted row wrappers is enough. Offscreen rows swap their
// heavy content (images, buttons, table cells) for a height-only placeholder,
// so DOM/memory stays bounded no matter how many items are loaded; the wrapper
// itself never unmounts, so we never lose track of a row to re-observe.
export type VirtualGridProps<T> = {
  items: T[];
  /**
   * Renders one row's worth of content (already sliced to `columns` items).
   * When `as` is 'tbody' this MUST return a single `<tr>` element (its ref
   * is attached directly, so it can carry its own onClick/style/etc).
   */
  renderRow: (rowItems: T[], rowIndex: number, columns: number) => ReactNode;
  /** Initial/fallback row height in px; self-corrects from the first measured row. */
  rowHeight: number;
  /** Gap applied below each row (div mode only). Default 0. */
  gap?: number;
  /** Grid mode: responsive column count, mirrors CSS `repeat(auto-fill, minmax(N,1fr))`. */
  minColumnWidth?: number;
  /** List mode: fixed column count (usually 1). Ignored when `minColumnWidth` is set. */
  columns?: number;
  /** How far outside the viewport a row still counts as "visible". Default 600. */
  overscanPx?: number;
  /** Outer wrapper + per-row element: 'div' rows or 'tr' rows inside a 'tbody'. */
  as?: 'div' | 'tbody';
  /** colSpan for the placeholder <td> when `as` is 'tbody'. */
  placeholderColSpan?: number;
  className?: string;
  style?: CSSProperties;
};

export default function VirtualGrid<T>({
  items, renderRow, rowHeight, gap = 0, minColumnWidth, columns: fixedColumns,
  overscanPx = 600, as = 'div', placeholderColSpan = 1, className, style,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [columns, setColumns] = useState(fixedColumns ?? 1);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const [visible, setVisible] = useState<Set<number>>(() => new Set());

  useEffect(() => {
    if (!minColumnWidth || !containerRef.current) return;
    const el = containerRef.current;
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setColumns(Math.max(1, Math.floor((w + gap) / (minColumnWidth + gap))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [minColumnWidth, gap]);

  const rows = useMemo(() => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += columns) out.push(items.slice(i, i + columns));
    return out;
  }, [items, columns]);

  const targets = useRef(new Map<Element, number>());
  const observerRef = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      setVisible((cur) => {
        const next = new Set(cur);
        for (const e of entries) {
          const i = targets.current.get(e.target);
          if (i === undefined) continue;
          if (e.isIntersecting) next.add(i); else next.delete(i);
        }
        return next;
      });
    }, { rootMargin: `${overscanPx}px 0px` });
    observerRef.current = io;
    return () => io.disconnect();
  }, [overscanPx]);

  const register = useCallback((el: Element | null, index: number) => {
    const io = observerRef.current;
    if (!io) return;
    for (const [t, i] of targets.current) if (i === index && t !== el) { io.unobserve(t); targets.current.delete(t); }
    if (el) { targets.current.set(el, index); io.observe(el); }
  }, []);

  // Only row 0 is measured — grid rows share one aspect-ratio-driven height,
  // and list rows are uniform enough that one sample is a good estimate for all.
  // One persistent observer (rather than a fresh one per mount) so re-measuring
  // row 0 across renders never leaks a ResizeObserver instance.
  const rowHeightObserver = useRef<ResizeObserver | null>(null);
  if (!rowHeightObserver.current) {
    rowHeightObserver.current = new ResizeObserver(([entry]) => setMeasuredHeight(entry.contentRect.height));
  }
  useEffect(() => () => rowHeightObserver.current?.disconnect(), []);

  // Ref callbacks MUST keep a stable identity across renders — a fresh inline
  // closure per row would make React detach+reattach every row's ref (and
  // re-run the IntersectionObserver (un)observe dance) on every scroll-driven
  // re-render, which is exactly the jank virtualization exists to avoid.
  const refCache = useRef(new Map<number, (el: Element | null) => void>());
  const getRef = (i: number) => {
    let fn = refCache.current.get(i);
    if (!fn) {
      fn = (el: Element | null) => {
        register(el, i);
        if (i === 0) { if (el) rowHeightObserver.current?.observe(el); else rowHeightObserver.current?.disconnect(); }
      };
      refCache.current.set(i, fn);
    }
    return fn;
  };

  // Rows past the end of a shrunk list (filter change) must stop being observed.
  useEffect(() => {
    for (const [el, i] of targets.current) {
      if (i >= rows.length) { observerRef.current?.unobserve(el); targets.current.delete(el); }
    }
    for (const i of refCache.current.keys()) if (i >= rows.length) refCache.current.delete(i);
  }, [rows.length]);

  const height = measuredHeight ?? rowHeight;

  const rowNodes = rows.map((rowItems, i) => {
    const isVisible = visible.has(i);
    const content = isVisible ? renderRow(rowItems, i, columns) : null;
    if (as === 'tbody') {
      if (content) return cloneElement(content as ReactElement, { key: i, ref: getRef(i) });
      return (
        <tr key={i} ref={getRef(i) as never}>
          <td colSpan={placeholderColSpan} style={{ height, padding: 0, border: 'none' }} />
        </tr>
      );
    }
    return (
      <div key={i} ref={getRef(i) as never} style={{ minHeight: height, marginBottom: i < rows.length - 1 ? gap : 0 }}>
        {content}
      </div>
    );
  });

  if (as === 'tbody') {
    return <tbody ref={containerRef as never} className={className} style={style}>{rowNodes}</tbody>;
  }
  return <div ref={containerRef as never} className={className} style={style}>{rowNodes}</div>;
}
