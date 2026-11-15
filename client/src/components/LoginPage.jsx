import { useState } from 'react';
import { api } from '../api.js';
import { LogoIcon } from './Icons.jsx';

// logowanie i zakładanie konta w jednym formularzu
export default function LoginPage({ onLoggedIn }) {
  const [mode, setMode] = useState('login');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isRegister = mode === 'register';

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = isRegister
        ? await api.register(login, password)
        : await api.login(login, password);
      onLoggedIn(user);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  function switchMode() {
    setMode(isRegister ? 'login' : 'register');
    setError('');
  }

  return (
    <main className="auth">
      <form className="auth-card" onSubmit={submit}>
        <h1 className="brand">
          <span className="logo">
            <LogoIcon />
          </span>
          Filemenager
        </h1>
        <h2>{isRegister ? 'Załóż konto' : 'Zaloguj się'}</h2>

        <label>
          Login
          <input
            type="text"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            minLength={3}
            maxLength={32}
            required
            autoFocus
          />
        </label>

        <label>
          Hasło
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            minLength={isRegister ? 6 : undefined}
            required
          />
        </label>

        {error && (
          <p className="notice" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="btn btn-primary" disabled={busy}>
          {isRegister ? 'Utwórz konto' : 'Zaloguj'}
        </button>

        <p className="muted switch">
          {isRegister ? 'Masz już konto?' : 'Nie masz konta?'}{' '}
          <button type="button" className="link" onClick={switchMode}>
            {isRegister ? 'Zaloguj się' : 'Zarejestruj się'}
          </button>
        </p>
      </form>
    </main>
  );
}
