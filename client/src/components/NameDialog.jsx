import { useEffect, useRef, useState } from 'react';

// okno do wpisania nazwy (nowy folder / plik / zmiana nazwy)
export default function NameDialog({ title, initial, onSubmit, onClose }) {
  const ref = useRef(null);
  const [name, setName] = useState(initial);

  useEffect(() => {
    if (!ref.current.open) ref.current.showModal();
  }, []);

  return (
    <dialog ref={ref} onClose={onClose}>
      <h2>{title}</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
          maxLength={255}
          required
          autoFocus
        />
        <div className="dialog-buttons">
          <button type="button" className="btn" onClick={onClose}>
            Anuluj
          </button>
          <button type="submit" className="btn btn-primary">
            Zatwierdź
          </button>
        </div>
      </form>
    </dialog>
  );
}
