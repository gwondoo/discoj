import {useEffect, useRef} from 'react';
import type {Discoj, View} from '../discoj.ts';

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
      <h2 id="delete-heading">이 레코드를 상자에서 뺄까요?</h2>
      <p className="delete-title">{target?.title?.trim() || '제목을 확인할 수 없는 영상'}</p>
      {playingNow && <p className="delete-note">현재 음악은 끝까지 재생됩니다.</p>}
      {view.deleteError && <p className="delete-error" role="status">{view.deleteError}</p>}
      <div className="dialog-actions">
        <button type="button" autoFocus disabled={view.deleting} onClick={app.cancelDelete}>취소</button>
        <button type="button" className="danger" disabled={view.deleting} onClick={app.confirmDelete}>{view.deleting ? '삭제 중…' : '삭제'}</button>
      </div>
    </dialog>
  );
}
