import { useEffect, useState } from 'react';
import { api } from '../api.js';

// kolor kropki zależy od rodzaju operacji
const KIND = {
  'nowy folder': 'add',
  'nowy plik': 'add',
  upload: 'add',
  edycja: 'edit',
  'zmiana nazwy': 'edit',
  usunięcie: 'remove',
};

// dane z activity-service; odświeżane razem z listą plików
export default function ActivityPanel({ version }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .activity()
      .then((list) => {
        setEvents(list.slice(0, 10));
        setError(false);
      })
      .catch(() => setError(true));
  }, [version]);

  return (
    <div className="activity">
      <h2 className="section-title">Ostatnie zmiany</h2>
      {error && <p className="muted">Serwis historii niedostępny</p>}
      {!error && !events.length && <p className="muted">Brak zmian</p>}
      <ul>
        {events.map((event, i) => (
          <li key={`${i}-${event.time}`} className={`kind-${KIND[event.action] ?? 'edit'}`}>
            <div className="activity-head">
              <b>{event.action}</b>
              <time>{new Date(event.time).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</time>
            </div>
            <span className="muted">
              /{event.path ? `${event.path}/` : ''}
              {event.name}
              {event.newName && ` → ${event.newName}`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
