export const getApiBase = () => {
  const envApi = import.meta.env?.VITE_API_URL;
  return envApi ? envApi.replace(/\/$/, '') : '';
};

export const getWsUrl = () => {
  const envWs = import.meta.env?.VITE_WS_URL;
  if (envWs) {
    return envWs.endsWith('/ws/voice-session') ? envWs : `${envWs.replace(/\/$/, '')}/ws/voice-session`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const isDev = window.location.port === '5173';
  const targetHost = isDev ? `${window.location.hostname}:8000` : window.location.host;
  return `${protocol}//${targetHost}/ws/voice-session`;
};

export const apiUrl = (endpoint) => {
  const base = getApiBase();
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  return `${base}${cleanEndpoint}`;
};
