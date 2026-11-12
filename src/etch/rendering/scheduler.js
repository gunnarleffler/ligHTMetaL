/** One coalescing frame queue per editor. No browser access at module evaluation. */
export function createScheduler(window, callback) {
  let frame = null, destroyed = false;
  return {
    request() {
      if (destroyed || frame !== null) return;
      frame = window.requestAnimationFrame(() => { frame = null; if (!destroyed) callback(); });
    },
    destroy() {
      destroyed = true;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
