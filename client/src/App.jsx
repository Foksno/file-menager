import { useEffect, useState } from 'react';
import { api, setUnauthorizedHandler } from './api.js';
import LoginPage from './components/LoginPage.jsx';
import FileManager from './FileManager.jsx';

export default function App() {
  // undefined = sprawdzamy sesję, null = niezalogowany
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    api.me().then(setUser);
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  async function logout() {
    try {
      await api.logout();
    } finally {
      window.location.hash = '';
      setUser(null);
    }
  }

  if (user === undefined) return <p className="empty">Wczytywanie…</p>;
  if (!user) return <LoginPage onLoggedIn={setUser} />;
  // key: po zmianie konta cały widok (i WebSocket) startuje od nowa
  return <FileManager key={user.id} user={user} onLogout={logout} />;
}
