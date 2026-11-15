import { hashFor } from '../paths.js';

// ścieżka nad plikami - każdy folder nadrzędny to link
export default function Breadcrumbs({ path }) {
  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ name: 'Moje pliki', href: hashFor('') }].concat(
    parts.map((name, i) => ({ name, href: hashFor(parts.slice(0, i + 1).join('/')) }))
  );

  return (
    <nav className="breadcrumbs">
      {crumbs.map((crumb, i) => (
        <span key={crumb.href} className="crumb-wrap">
          {i > 0 && <span className="sep">›</span>}
          {i === crumbs.length - 1 ? (
            <span className="crumb current">{crumb.name}</span>
          ) : (
            <a className="crumb" href={crumb.href}>
              {crumb.name}
            </a>
          )}
        </span>
      ))}
    </nav>
  );
}
