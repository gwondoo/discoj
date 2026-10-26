// Media-only progress; never calls YouTube Data API or changes playback on report.
(() => {
  function read(video, {ad = false, live = false} = {}) {
    const duration = Number.isFinite(video?.duration) && video.duration > 0 ? video.duration : null;
    const position = Number.isFinite(video?.currentTime) && video.currentTime >= 0 ? video.currentTime : 0;
    return {position: ad ? 0 : position, duration: ad ? null : duration,
      positionAt: Date.now(), ad, live: live || video?.duration === Infinity};
  }
  function seekable(video, seconds, flags) {
    const state = read(video, flags);
    if (state.ad || state.live || !state.duration || !Number.isFinite(seconds) || seconds < 0 || seconds > state.duration) return false;
    const ranges = video.seekable;
    for (let i = 0; i < (ranges?.length || 0); i++) {
      if (seconds >= ranges.start(i) && seconds <= ranges.end(i)) return true;
    }
    return false;
  }
  globalThis.DiscoJProgress = {read, seekable};
})();
