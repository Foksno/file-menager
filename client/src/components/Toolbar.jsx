export default function Toolbar({ onNewFolder, onNewFile, onUpload, disabled }) {
  return (
    <div className="toolbar">
      <button type="button" className="btn btn-primary" onClick={onNewFolder} disabled={disabled}>
        + nowy folder
      </button>
      <button type="button" className="btn" onClick={onNewFile} disabled={disabled}>
        + nowy plik tekstowy
      </button>
      <label className={`btn ${disabled ? 'disabled' : ''}`}>
        ⬆ wyślij pliki
        <input
          type="file"
          multiple
          hidden
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files.length) onUpload([...e.target.files]);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
