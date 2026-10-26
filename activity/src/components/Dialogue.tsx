import {useEffect, useState} from 'react';
import {useReducedMotion} from '../lib/use-reduced-motion.ts';

// Reveals a villager-style line one character at a time.
function useTypewriter(text: string) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);
  const chars = Array.from(text);
  useEffect(() => {
    setCount(0);
    if (reduced) return;
    const timer = setInterval(() => setCount(count => {
      if (count >= chars.length) { clearInterval(timer); return count; }
      return count + 1;
    }), 32);
    return () => clearInterval(timer);
  }, [text, reduced]);
  const done = reduced || count >= chars.length;
  return {shown: done ? text : chars.slice(0, count).join(''), done};
}

// Wraps the highlighted words (a song title) in <em>, even while they are half typed.
function Marked({text, full, highlight}: {text: string, full: string, highlight?: string}) {
  const start = highlight ? full.indexOf(highlight) : -1;
  if (start < 0 || !highlight || text.length <= start) return <>{text}</>;
  const end = start + highlight.length;
  return <>{text.slice(0, start)}<em>{text.slice(start, end)}</em>{text.slice(end)}</>;
}

export function Dialogue({speaker, text, highlight, error, children, onDismiss}: {
  speaker: string;
  text: string;
  highlight?: string;
  error?: boolean;
  children?: React.ReactNode;
  onDismiss?: () => void;
}) {
  const {shown, done} = useTypewriter(text);
  if (!text) return null;
  return (
    <div className={'dialogue' + (error ? ' error' : '')}>
      {onDismiss && <button type="button" className="dialogue-dismiss" onClick={onDismiss} aria-label="오류 메시지 닫기">닫기</button>}
      <span className="nametag">{speaker}</span>
      <p role="status" aria-live="polite">
        <span className="sr-only">{text}</span>
        <span className="ghost" aria-hidden="true"><Marked text={text} full={text} highlight={highlight}/></span>
        <span aria-hidden="true"><Marked text={shown} full={text} highlight={highlight}/></span>
      </p>
      {done && children}
      {done && !children && <span className="next" aria-hidden="true">▼</span>}
    </div>
  );
}
