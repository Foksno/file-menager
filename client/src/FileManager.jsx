import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from './api.js';
import { pathFromHash, hashFor, joinPath } from './paths.js';
import Toolbar from './components/Toolbar.jsx';
import Breadcrumbs from './components/Breadcrumbs.jsx';
import FileGrid from './components/FileGrid.jsx';
import NameDialog from './components/NameDialog.jsx';
import TextEditor from './components/TextEditor.jsx';
import ActivityPanel from './components/ActivityPanel.jsx';

// widok zalogowanego użytkownika - jego pliki, historia i przyciski
export default function FileManager({ user, onLogout }) {
  const [path, setPath] = useState(pathFromHash);
  const [data, setData] = useState(null);
  const [listError, setListError] = useState('');
  const [notice, setNotice] = useState('');
  // zwiększany po każdej zmianie - wymusza ponowne pobranie listy i historii
  const [version, setVersion] = useState(0);
  const [online, setOnline] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [editing, setEditing] = useState(null);

  const refresh = () => setVersion((v) => v + 1);

  // nawigacja po folderach = zmiana hasha, bez przeładowania strony
  useEffect(() => {
    const onHash = () => setPath(pathFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    api
      .list(path)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        setListError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setData(null);
        setListError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [path, version]);

  // WebSocket: zmiana zrobiona w innej karcie od razu odświeża widok
  useEffect(() => {
    const socket = io();
    socket.on('connect', () => setOnline(true));
    socket.on('disconnect', () => setOnline(false));
    socket.on('changed', refresh);
    return () => socket.disconnect();
  }, []);

  async function run(action) {
    try {
      await action();
      setNotice('');
    } catch (err) {
      setNotice(err.message);
    }
    refresh();
  }

  const askName = (title, initial, onSubmit) =>
    setDialog({ title, initial, onSubmit });

  const handlers = {
    onNewFolder: () =>
      askName('Nazwa nowego folderu', '', (name) => run(() => api.createFolder(path, name))),
    onNewFile: () =>
      askName('Nazwa nowego pliku', '', (name) => run(() => api.createFile(path, name))),
    onUpload: (files) => run(() => api.upload(path, files)),
  };

  const itemHandlers = {
    folderHref: (name) => hashFor(joinPath(path, name)),
    downloadUrl: (name) => api.downloadUrl(path, name),
    onEdit: (name) => setEditing(name),
    onRename: (name) =>
      askName('Nowa nazwa', name, (newName) => run(() => api.rename(path, name, newName))),
    onDelete: (name, isFolder) => {
      const question = isFolder
        ? `Usunąć folder „${name}” razem z zawartością?`
        : `Usunąć plik „${name}”?`;
      if (confirm(question)) run(() => api.remove(path, name));
    },
  };

  return (
    <>
      <header className="topbar">
        <span className="logo">📁</span>
        <span className="title">Filemenager</span>
        <span className={`live ${online ? 'on' : ''}`}>
          {online ? '● na żywo' : '○ offline'}
        </span>
        <span className="user">👤 {user.login}</span>
        <button type="button" className="btn btn-small" onClick={onLogout}>
          Wyloguj
        </button>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <Toolbar {...handlers} disabled={!data} />
          <ActivityPanel version={version} />
        </aside>

        <section className="content">
          <Breadcrumbs path={path} />

          {notice && (
            <p className="notice" role="alert">
              {notice}
              <button type="button" onClick={() => setNotice('')} aria-label="Zamknij">
                ✕
              </button>
            </p>
          )}

          {listError && <p className="empty">{listError}</p>}
          {data && <FileGrid folders={data.folders} files={data.files} {...itemHandlers} />}
        </section>
      </main>

      {dialog && (
        <NameDialog
          title={dialog.title}
          initial={dialog.initial}
          onSubmit={(name) => {
            setDialog(null);
            dialog.onSubmit(name);
          }}
          onClose={() => setDialog(null)}
        />
      )}

      {editing && (
        <TextEditor
          path={path}
          name={editing}
          onSaved={refresh}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
