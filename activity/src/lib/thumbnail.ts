// YouTube video ID from a watch, short or youtu.be link; null when the link has none.
export function videoId(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  const host = parsed.hostname.replace(/^(www|m|music)\./, '');
  const id = host === 'youtu.be' ? parsed.pathname.slice(1).split('/')[0]
    : host === 'youtube.com' ? parsed.searchParams.get('v') ?? parsed.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1]
    : null;
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

// Served by our nginx (/thumb/<id>), which proxies only i.ytimg.com.
export function thumbnailUrl(url: string): string | null {
  const id = videoId(url);
  return id ? `/thumb/${id}` : null;
}
