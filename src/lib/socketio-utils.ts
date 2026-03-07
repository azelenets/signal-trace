export const parseSocketIoAuth = (raw: string): { auth: Record<string, unknown> | null; error: string } => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { auth: null, error: '' };
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { auth: null, error: 'Socket.IO auth must be a JSON object.' };
    }
    return { auth: parsed as Record<string, unknown>, error: '' };
  } catch {
    return { auth: null, error: 'Socket.IO auth must be valid JSON.' };
  }
};

export const normalizeSocketIoPath = (path: string): string => {
  const trimmed = path.trim() || '/socket.io';
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
};

export const normalizeSocketIoNamespace = (ns: string): string => {
  const trimmed = ns.trim() || '/';
  if (trimmed === '/') return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

export const buildSocketIoWsUrl = (endpoint: string, path: string): string | null => {
  try {
    const parsed = new URL(endpoint);
    if (parsed.protocol === 'http:') parsed.protocol = 'ws:';
    if (parsed.protocol === 'https:') parsed.protocol = 'wss:';
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
      return null;
    }

    parsed.pathname = normalizeSocketIoPath(path);
    parsed.searchParams.set('EIO', '4');
    parsed.searchParams.set('transport', 'websocket');
    return parsed.toString();
  } catch {
    return null;
  }
};
