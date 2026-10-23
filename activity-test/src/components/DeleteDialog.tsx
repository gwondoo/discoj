import {useEffect, useRef} from 'react';
import type {Discoj, View} from '../discoj.ts';

// Styled like a villager conversation: a question line plus answer choices.
export function DeleteDialog({view, app}: {view: View, app: Discoj}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const target = view.deleteTarget;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (target && !element.open) element.showModal();
    if (!target && element.open) element.close();
  }, [target]);

  const playingNow = target && view.current?.url === target.url;
  return (
    <dialog ref={dialog} aria-labelledby="delete-heading"
      onCancel={event => { event.preventDefault(); app.cancelDelete(); }}
      onClose={() => { if (view.deleteTarget && !view.deleting) app.cancelDelete(); }}>
      <div className="dialogue">
        <span className="nametag">K.K.</span>
        <h2 id="delete-heading">이 레코드를 상자에서 뺄까요?</h2>
        <p className="delete-title">「{target?.title?.trim() || '제목을 확인할 수 없는 영상'}」</p>
        {playingNow && <p className="delete-note">지금 나오는 곡은 끝까지 틀어줄게요.</p>}
        {view.deleteError && <p className="delete-error" role="status">{view.deleteError}</p>}
      </div>
      <div className="choices">
        <button type="button" className="choice" disabled={view.deleting} onClick={app.confirmDelete}>{view.deleting ? '빼는 중…' : '응, 빼줘'}</button>
        <button type="button" className="choice" autoFocus disabled={view.deleting} onClick={app.cancelDelete}>아니, 그냥 둘래</button>
      </div>
    </dialog>
  );
}
