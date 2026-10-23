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

export function Dialogue({speaker, text, error, children, onDismiss}: {
  speaker: string;
  text: string;
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
        <span aria-hidden="true">{shown}</span>
      </p>
      {done && children}
      {done && !children && <span className="next" aria-hidden="true">▼</span>}
    </div>
  );
}
