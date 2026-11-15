import { FolderPlusIcon, FilePlusIcon, UploadIcon } from './Icons.jsx';

export default function Toolbar({ onNewFolder, onNewFile, onUpload, disabled }) {
  return (
    <div className="toolbar">
      <label className={`btn btn-primary ${disabled ? 'disabled' : ''}`}>
        <UploadIcon />
        Wyślij pliki
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
      <button type="button" className="btn" onClick={onNewFolder} disabled={disabled}>
        <FolderPlusIcon />
        Nowy folder
      </button>
      <button type="button" className="btn" onClick={onNewFile} disabled={disabled}>
        <FilePlusIcon />
        Nowy plik tekstowy
      </button>
    </div>
  );
}
