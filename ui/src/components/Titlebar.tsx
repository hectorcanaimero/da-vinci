import { useEffect, useState, type CSSProperties } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

const HEIGHT = 38;

export default function Titlebar({ title = 'Reverón' }: { title?: string }) {
  // D9: macOS keeps the native traffic lights (titleBarStyle: Overlay in
  // tauri.conf.json), so only Windows/Linux need our own min/max/close.
  const [isMac, setIsMac] = useState(true);

  useEffect(() => {
    invoke<{ os: string; modifier_key: string }>('platform_info')
      .then((info) => setIsMac(info.os === 'macos'))
      .catch(() => {});
  }, []);

  const win = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      style={{
        height: HEIGHT,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        WebkitUserSelect: 'none',
        userSelect: 'none',
        background: 'var(--surface, #1a1a1a)',
        borderBottom: '1px solid var(--border, #2a2a2a)',
        paddingLeft: isMac ? 78 : 12,
      }}
    >
      <span style={{ fontSize: 13, opacity: 0.8, pointerEvents: 'none' }}>{title}</span>
      {!isMac && (
        <div style={{ position: 'absolute', right: 0, top: 0, height: HEIGHT, display: 'flex' }}>
          <button aria-label="Minimize" onClick={() => win.minimize()} style={btnStyle}>
            &#x2013;
          </button>
          <button aria-label="Maximize" onClick={() => win.toggleMaximize()} style={btnStyle}>
            &#x25a1;
          </button>
          <button aria-label="Close" onClick={() => win.close()} style={{ ...btnStyle, ...closeStyle }}>
            &#x2715;
          </button>
        </div>
      )}
    </div>
  );
}

const btnStyle: CSSProperties = {
  width: 46,
  height: HEIGHT,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 14,
};

// ponytail: hover-to-red on close is a two-line CSS class away; skip until FR-3 asks for it.
const closeStyle: CSSProperties = {};
