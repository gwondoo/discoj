// Display form of a video title. Uploaders decorate titles with Unicode "math" letters
// (𝐏𝐥𝐚𝐲𝐥𝐢𝐬𝐭, 𝘱𝘭𝘢𝘺𝘭𝘪𝘴𝘵) and full-width brackets that our fonts lack, so they fell back
// to a system serif. NFKC maps them to plain letters; Hangul and emoji are unchanged.
// Only for display: matching and requests keep the original title and URL.
export function displayTitle(raw: string | null | undefined, fallback = '제목을 확인할 수 없는 영상'): string {
  return (raw ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim() || fallback;
}
