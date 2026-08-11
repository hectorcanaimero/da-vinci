const REQUIRED_ENV = [
  'INFISICAL_URL',
  'INFISICAL_CLIENT_ID',
  'INFISICAL_CLIENT_SECRET',
  'DAVINCI_PROJECT_ID',
];

let tokenCache = null;

function assertEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `Da Vinci: faltan variables de entorno: ${missing.join(', ')}\n` +
      `Ver: ~/.claude/skills/da-vinci/README.md#setup`
    );
  }
}

async function login() {
  const { INFISICAL_URL, INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET } = process.env;
  const res = await fetch(`${INFISICAL_URL}/api/v1/auth/universal-auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientId: INFISICAL_CLIENT_ID,
      clientSecret: INFISICAL_CLIENT_SECRET,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Infisical login falló (${res.status}): ${body}`);
  }
  const data = await res.json();
  const expiresInMs = (data.expiresIn ?? 7200) * 1000;
  return {
    token: data.accessToken,
    expiresAt: Date.now() + expiresInMs - 60_000,
  };
}

async function getToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now()) return tokenCache.token;
  tokenCache = await login();
  return tokenCache.token;
}

export async function loadSecrets() {
  assertEnv();
  const {
    INFISICAL_URL,
    DAVINCI_PROJECT_ID,
    DAVINCI_ENV = 'prod',
  } = process.env;

  const token = await getToken();
  const url = new URL(`${INFISICAL_URL}/api/v3/secrets/raw`);
  url.searchParams.set('workspaceId', DAVINCI_PROJECT_ID);
  url.searchParams.set('environment', DAVINCI_ENV);
  url.searchParams.set('secretPath', '/');

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Infisical fetch secrets falló (${res.status}): ${body}`);
  }
  const data = await res.json();
  const secrets = {};
  for (const s of data.secrets ?? []) {
    if (s.secretValue) secrets[s.secretKey] = s.secretValue;
  }
  return secrets;
}

export async function injectSecretsIntoEnv() {
  const secrets = await loadSecrets();
  for (const [k, v] of Object.entries(secrets)) {
    if (!process.env[k]) process.env[k] = v;
  }
  return Object.keys(secrets);
}

export function clearTokenCache() {
  tokenCache = null;
}
