// Discord supplies platform=desktop|mobile. Pointer fallback is only for standalone previews.
export function desktopLayout(platform: string | null, coarsePointer: boolean): boolean {
  return platform ? platform === 'desktop' : !coarsePointer;
}
