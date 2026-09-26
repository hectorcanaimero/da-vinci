import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { setToken, setUnauthorizedHandler } from '../api';

// A 401 makes the API client await the handler below, which resolves once a key is submitted.
export default function ApiKeyGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const waiters = useRef<Array<() => void>>([]);

  useEffect(() => {
    setUnauthorizedHandler(() => new Promise<void>((resolve) => {
      waiters.current.push(resolve);
      setOpen(true);
    }));
    return () => setUnauthorizedHandler(null);
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setToken(value.trim());
    setValue('');
    setOpen(false);
    waiters.current.splice(0).forEach((r) => r());
  };

  return (
    <>
      {children}
      {open && (
        <div className="api-key-gate" role="dialog" aria-modal="true" aria-label="API key">
          <form onSubmit={submit}>
            <p>This server requires an API key.</p>
            <input type="password" autoFocus required value={value} onChange={(e) => setValue(e.target.value)} placeholder="API key" />
            <button type="submit">Save</button>
          </form>
        </div>
      )}
    </>
  );
}
