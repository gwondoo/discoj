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
  radio: 'M4 9h16v11H4ZM7 9l10-5M8 13h4M8 16h4M16.5 14.5a1.5 1.5 0 1 1 0 .01',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7',
  crate: 'M3 9h18v11H3ZM3 9l2-4h14l2 4M9 13h6',
  disc: 'M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0ZM14.5 12a2.5 2.5 0 1 1-5 0a2.5 2.5 0 0 1 5 0ZM12 6.5a5.5 5.5 0 0 0-5.5 5.5',
  queue: 'M4 6h12M4 11h12M4 16h7M19 4v11.5M19 15.5a2.5 2.5 0 1 1-2.5-2.5H19',
  plus: 'M12 5v14M5 12h14',
  headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1ZM20 15h-3v5h2a1 1 0 0 0 1-1Z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({name, className}: {name: IconName, className?: string}) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className={className}><path d={paths[name]}/></svg>;
}
