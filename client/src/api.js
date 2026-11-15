// wszystkie wywołania REST API w jednym miejscu

// ustawiane przez App - wygasła sesja (401) wraca do ekranu logowania
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401 && !url.startsWith('/api/auth/')) onUnauthorized();
  if (!res.ok) {
    let message = `Błąd ${res.status}`;
    try {
      message = (await res.json()).error || message;
    } catch {
      // odpowiedź bez JSON-a - zostaje kod błędu
    }
    throw new Error(message);
  }
  return res.status === 204 ? null : res.json();
}

const qs = (params) => new URLSearchParams(params).toString();

const send = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const api = {
  // null gdy nikt nie jest zalogowany
  me: () => request('/api/auth/me').catch(() => null),

  login: (login, password) => request('/api/auth/login', send('POST', { login, password })),

  register: (login, password) =>
    request('/api/auth/register', send('POST', { login, password })),

  logout: () => request('/api/auth/logout', { method: 'POST' }),

  list: (path) => request(`/api/list?${qs({ path })}`),

  createFolder: (path, name) => request('/api/folder', send('POST', { path, name })),

  createFile: (path, name) => request('/api/file', send('POST', { path, name })),

  upload: (path, files) => {
    const form = new FormData();
    for (const file of files) form.append('files', file);
    return request(`/api/upload?${qs({ path })}`, { method: 'POST', body: form });
  },

  rename: (path, oldName, newName) =>
    request('/api/rename', send('PATCH', { path, oldName, newName })),

  remove: (path, name) => request(`/api/item?${qs({ path, name })}`, { method: 'DELETE' }),

  readText: (path, name) => request(`/api/content?${qs({ path, name })}`),

  saveText: (path, name, text) => request('/api/content', send('PUT', { path, name, text })),

  downloadUrl: (path, name) => `/api/download?${qs({ path, name })}`,

  activity: () => request('/api/activity'),
};
