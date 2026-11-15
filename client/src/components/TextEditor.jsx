import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

// podgląd i edycja pliku tekstowego
export default function TextEditor({ path, name, onSaved, onClose }) {
  const ref = useRef(null);
  const [text, setText] = useState(null);
  const [saved, setSaved] = useState('');
  const [status, setStatus] = useState('Wczytywanie…');

  useEffect(() => {
    if (!ref.current.open) ref.current.showModal();
  }, []);

  useEffect(() => {
    api
      .readText(path, name)
      .then(({ text }) => {
        setText(text);
        setSaved(text);
        setStatus('');
      })
      .catch((err) => setStatus(err.message));
  }, [path, name]);

  async function save() {
    setStatus('Zapisywanie…');
    try {
      await api.saveText(path, name, text);
      setSaved(text);
      setStatus('Zapisano');
      onSaved();
    } catch (err) {
      setStatus(err.message);
    }
  }

  const dirty = text !== null && text !== saved;

  function close() {
    if (!dirty || confirm('Zamknąć bez zapisywania zmian?')) onClose();
  }

  return (
    <dialog
      ref={ref}
      className="editor"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <h2>{name}</h2>
      <textarea
        value={text ?? ''}
        onChange={(e) => setText(e.target.value)}
        disabled={text === null}
        spellCheck={false}
      />
      <div className="dialog-buttons">
        <span className="status">{dirty ? 'Niezapisane zmiany' : status}</span>
        <button type="button" className="btn" onClick={close}>
          Zamknij
        </button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty}>
          Zapisz
        </button>
      </div>
    </dialog>
  );
}
