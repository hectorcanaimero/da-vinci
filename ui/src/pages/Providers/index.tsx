import { useEffect, useState } from 'react';
import { listProviders, listModels, setProviderKey, testProvider } from '../../api';
import type { ProviderStatus, ModelInfo } from '../../types';
import './providers.css';

export default function Providers() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [prov, mod] = await Promise.all([listProviders(), listModels()]);
        setProviders(prov.items);
        setModels(mod.items);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to load providers';
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const getProviderModels = (providerId: string) =>
    models.filter((m) => m.provider === providerId);

  const getProviderKinds = (providerId: string) => {
    const kinds = new Set(getProviderModels(providerId).map((m) => m.kind));
    return Array.from(kinds).join(', ') || '—';
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const status = await testProvider(id);
      setProviders((prev) => prev.map((p) => (p.id === id ? status : p)));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Test failed';
      setError(msg);
    } finally {
      setTesting(null);
    }
  };

  const handleSave = async (id: string) => {
    const key = keyInput[id];
    if (!key) return;
    setSaving(id);
    try {
      const status = await setProviderKey(id, key);
      setProviders((prev) => prev.map((p) => (p.id === id ? status : p)));
      setKeyInput((prev) => ({ ...prev, [id]: '' }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save key';
      setError(msg);
    } finally {
      setSaving(null);
    }
  };

  if (loading) return <h1>Loading providers…</h1>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="providers-page">
      <h1>Providers</h1>

      <div className="warning-banner">
        <strong>Keys are stored in:</strong> <code>~/.config/da-vinci/.env</code> (mode 600)
        {' '}· If Infisical is configured, it takes priority.
      </div>

      <div className="providers-grid">
        {providers.map((provider) => (
          <div key={provider.id} className="provider-card">
            <div className="card-header">
              <h2>{provider.id}</h2>
              <div className={`status status-${provider.status}`}>
                {provider.status === 'connected' && '✓ Connected'}
                {provider.status === 'missing' && '◯ No key'}
                {provider.status === 'error' && '✕ Error'}
              </div>
            </div>

            <div className="card-content">
              {provider.error && (
                <div className="error-box">
                  <strong>Error:</strong> {provider.error}
                </div>
              )}

              <div className="info-row">
                <label>Source:</label>
                <span>{provider.source}</span>
              </div>

              {provider.keyHint && (
                <div className="info-row">
                  <label>Key hint:</label>
                  <code>***{provider.keyHint}</code>
                </div>
              )}

              <div className="info-row">
                <label>Covers:</label>
                <span>{getProviderKinds(provider.id)}</span>
              </div>
            </div>

            <div className="card-actions">
              <button
                className="btn btn-secondary"
                onClick={() => handleTest(provider.id)}
                disabled={testing === provider.id}
              >
                {testing === provider.id ? 'Testing…' : 'Test Connection'}
              </button>
            </div>

            <form
              className="key-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleSave(provider.id);
              }}
            >
              <input
                type="password"
                placeholder="Paste key here"
                value={keyInput[provider.id] ?? ''}
                onChange={(e) =>
                  setKeyInput((prev) => ({ ...prev, [provider.id]: e.target.value }))
                }
                autoComplete="off"
                disabled={saving === provider.id}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!keyInput[provider.id] || saving === provider.id}
              >
                {saving === provider.id ? 'Saving…' : 'Save'}
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
