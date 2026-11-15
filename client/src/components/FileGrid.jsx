import { formatSize, isTextFile } from '../paths.js';

function ItemActions({ name, isFolder, downloadUrl, onRename, onDelete }) {
  return (
    <div className="actions">
      {!isFolder && (
        <a className="action-btn" href={downloadUrl(name)} title="Pobierz" download>
          ⬇
        </a>
      )}
      <button type="button" className="action-btn" title="Zmień nazwę" onClick={() => onRename(name)}>
        ✎
      </button>
      <button
        type="button"
        className="action-btn danger"
        title="Usuń"
        onClick={() => onDelete(name, isFolder)}
      >
        ✕
      </button>
    </div>
  );
}

export default function FileGrid({ folders, files, folderHref, onEdit, ...actions }) {
  if (!folders.length && !files.length) {
    return <p className="empty">Ten folder jest pusty.</p>;
  }

  return (
    <>
      {folders.length > 0 && (
        <>
          <h2 className="section-title">Foldery</h2>
          <div className="grid">
            {folders.map((folder) => (
              <div className="item" key={folder.name}>
                <a className="item-link" href={folderHref(folder.name)}>
                  <span className="icon">📁</span>
                  <span className="name">{folder.name}</span>
                </a>
                <ItemActions name={folder.name} isFolder {...actions} />
              </div>
            ))}
          </div>
        </>
      )}

      {files.length > 0 && (
        <>
          <h2 className="section-title">Pliki</h2>
          <div className="grid">
            {files.map((file) => {
              const editable = isTextFile(file.name);
              return (
                <div className="item" key={file.name}>
                  <button
                    type="button"
                    className="item-link"
                    onClick={editable ? () => onEdit(file.name) : undefined}
                    disabled={!editable}
                    title={editable ? 'Otwórz w edytorze' : undefined}
                  >
                    <span className="icon">{editable ? '📝' : '📄'}</span>
                    <span className="name">{file.name}</span>
                    <span className="meta">
                      {formatSize(file.size)} · {new Date(file.mtime).toLocaleDateString('pl-PL')}
                    </span>
                  </button>
                  <ItemActions name={file.name} isFolder={false} {...actions} />
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
