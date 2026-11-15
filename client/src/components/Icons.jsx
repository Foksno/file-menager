// ikony SVG - wyglądają tak samo w każdym systemie (w przeciwieństwie do emoji)
const base = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const LogoIcon = () => (
  <svg {...base} width={18} height={18}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
  </svg>
);

export const FolderPlusIcon = () => (
  <svg {...base}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M12 11v5M9.5 13.5h5" />
  </svg>
);

export const FilePlusIcon = () => (
  <svg {...base}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5M12 12v6M9 15h6" />
  </svg>
);

export const UploadIcon = () => (
  <svg {...base}>
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12M7 9l5-5 5 5" />
  </svg>
);

export const DownloadIcon = () => (
  <svg {...base} width={15} height={15}>
    <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12M7 11l5 5 5-5" />
  </svg>
);

export const EditIcon = () => (
  <svg {...base} width={15} height={15}>
    <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z" />
  </svg>
);

export const TrashIcon = () => (
  <svg {...base} width={15} height={15}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </svg>
);

export const LogoutIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4" />
  </svg>
);

// duża ikona folderu na kafelku
export const FolderTile = () => (
  <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
    <path
      d="M4 12a4 4 0 0 1 4-4h10l4 4h18a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"
      fill="var(--folder)"
    />
    <path d="M4 18h40v18a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="var(--folder-front)" />
  </svg>
);

// ikona pliku z rozszerzeniem; kolor zależy od rodzaju pliku
const KINDS = [
  [/^(png|jpe?g|gif|webp|svg|bmp)$/, 'image'],
  [/^(txt|md|log|csv)$/, 'text'],
  [/^(js|jsx|ts|tsx|json|html|css|xml|ya?ml)$/, 'code'],
  [/^(pdf)$/, 'pdf'],
  [/^(zip|rar|7z|tar|gz)$/, 'archive'],
  [/^(mp3|wav|ogg|mp4|mov|avi|mkv)$/, 'media'],
];

export function FileTile({ name }) {
  const dot = name.lastIndexOf('.');
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
  const kind = KINDS.find(([re]) => re.test(ext))?.[1] ?? 'other';
  return (
    <span className={`file-tile kind-${kind}`} aria-hidden="true">
      <svg width="40" height="48" viewBox="0 0 40 48">
        <path d="M4 4a4 4 0 0 1 4-4h18l14 14v30a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" fill="var(--file)" />
        <path d="M26 0v10a4 4 0 0 0 4 4h10z" fill="var(--file-fold)" />
      </svg>
      {ext && <span className="ext">{ext.slice(0, 4)}</span>}
    </span>
  );
}
