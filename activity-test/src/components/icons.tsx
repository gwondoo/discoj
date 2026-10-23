const paths = {
  previous: 'M6 5v14M19 5 8 12l11 7Z',
  next: 'M18 5v14M5 5l11 7-11 7Z',
  play: 'm8 5 11 7-11 7Z',
  pause: 'M8 5v14M16 5v14',
  volume: 'M10 5 5 9H2v6h3l5 4ZM15 8c3 2 3 6 0 8M18 5c5 4 5 10 0 14',
  mute: 'M10 5 5 9H2v6h3l5 4ZM16 9l5 6M21 9l-5 6',
  refresh: 'M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 13-3l2 3M19 16a8 8 0 0 1-13 3l-2-3',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  link: 'M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1 1M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1-1',
} as const;

export type IconName = keyof typeof paths;

export function Icon({name, className}: {name: IconName, className?: string}) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className}><path d={paths[name]}/></svg>;
}
