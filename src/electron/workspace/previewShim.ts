// A tiny script OmniDesign injects into every previewed page. It is served, never committed to Git,
// and never authored by the agent. It runs inside the sandboxed, opaque-origin iframe and talks to the
// trusted parent only through postMessage. Three jobs:
//   1. report content height (ResizeObserver) so the parent can size an Artboard-fit tile to the page;
//   2. forward console output and window.onerror as preview diagnostics (the Phase 1 diagnostics
//      feature, which would otherwise regress once the preview is an iframe);
//   3. report its own page path on load so the focused-mode switcher stays in sync when in-page links
//      are followed.
// Messages are tagged so the parent can distinguish them from any other postMessage traffic.

export const PREVIEW_MESSAGE_SOURCE = 'omnidesign-preview-shim'

function shimBody(): string {
  return `(() => {
  var PAGE = window.__OMNIDESIGN_PAGE__ || 'index.html';
  var SOURCE = ${JSON.stringify(PREVIEW_MESSAGE_SOURCE)};
  function post(message) {
    try { parent.postMessage(Object.assign({ source: SOURCE, page: PAGE }, message), '*'); } catch (e) {}
  }
  // Pause the design's animation loops without reloading the frame. requestAnimationFrame is patched
  // BEFORE the page's own scripts run (this shim is the first script), so a paused frame stops driving
  // its rAF loops (the main CPU cost) while staying fully loaded. The parent resumes the active frame
  // and pauses the rest via postMessage — no remount, no white flash. One frame is allowed while paused
  // so canvas-based designs still paint a static first frame instead of showing blank.
  var paused = true;
  var rafPending = [];
  var fakeRafId = -1;
  var firstFrameDone = false;
  var realRaf = typeof window.requestAnimationFrame === 'function' ? window.requestAnimationFrame.bind(window) : null;
  var realCaf = typeof window.cancelAnimationFrame === 'function' ? window.cancelAnimationFrame.bind(window) : null;
  if (realRaf) {
    window.requestAnimationFrame = function (cb) {
      if (!paused) return realRaf(cb);
      if (!firstFrameDone) { firstFrameDone = true; return realRaf(cb); }
      var id = fakeRafId--; rafPending.push({ id: id, cb: cb }); return id;
    };
    window.cancelAnimationFrame = function (id) {
      if (typeof id === 'number' && id < 0) { rafPending = rafPending.filter(function (e) { return e.id !== id; }); return; }
      if (realCaf) realCaf(id);
    };
  }
  function setPaused(next) {
    if (next === paused) return;
    paused = next;
    if (!paused && realRaf) { var queued = rafPending; rafPending = []; queued.forEach(function (e) { realRaf(e.cb); }); }
  }
  function reportHeight() {
    try {
      // Measure the body's content height, NOT documentElement.scrollHeight — the latter is clamped to
      // at least the viewport height, so a short page could never shrink below the frame. Falling back
      // to documentElement only when there is no body.
      var body = document.body;
      var doc = document.documentElement;
      var height = body ? Math.max(body.scrollHeight, body.offsetHeight) : (doc ? doc.scrollHeight : 0);
      if (height > 0) post({ type: 'height', height: height });
    } catch (e) {}
  }
  function diagnostic(level, message, line, source) {
    if (!message) return;
    post({ type: 'diagnostic', level: level, message: String(message).slice(0, 2000), line: (typeof line === 'number' ? line : null), src: source || null });
  }
  ['error', 'warn'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      try { diagnostic(level === 'error' ? 'error' : 'warning', Array.prototype.join.call(arguments, ' ')); } catch (e) {}
      if (original) return original.apply(console, arguments);
    };
  });
  window.addEventListener('error', function (event) {
    diagnostic('error', event.message || (event.error && event.error.message) || 'Script error', event.lineno, event.filename);
  });
  window.addEventListener('unhandledrejection', function (event) {
    var reason = event.reason;
    diagnostic('error', 'Unhandled promise rejection: ' + (reason && reason.message ? reason.message : reason));
  });
  function ready() {
    post({ type: 'page' });
    reportHeight();
    try {
      if (typeof ResizeObserver !== 'undefined') {
        var observer = new ResizeObserver(function () { reportHeight(); });
        if (document.body) observer.observe(document.body);
      }
    } catch (e) {}
    window.addEventListener('load', reportHeight);
    window.addEventListener('resize', reportHeight);
    // The parent asks for a fresh measurement after a layout-affecting change (device size / fit mode).
    window.addEventListener('message', function (event) {
      if (!event.data) return;
      if (event.data.type === 'omnidesign-measure') reportHeight();
      else if (event.data.type === 'omnidesign-pause') setPaused(true);
      else if (event.data.type === 'omnidesign-resume') setPaused(false);
    });
    // Catch late layout (web fonts, images, Alpine expanding content) that fires no size event.
    [120, 400, 1000].forEach(function (delay) { setTimeout(reportHeight, delay); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
})();`
}

// Insert the shim as the first script in <head> (before the page's own scripts run, so console
// forwarding wraps console early). Falls back to prepending it if the document has no <head>.
export function injectPreviewShim(html: string, pagePath: string): string {
  const marker = `<script>window.__OMNIDESIGN_PAGE__=${JSON.stringify(pagePath)};</script><script>${shimBody()}</script>`
  const headMatch = html.match(/<head[^>]*>/i)
  if (headMatch) {
    const index = headMatch.index! + headMatch[0].length
    return html.slice(0, index) + marker + html.slice(index)
  }
  return marker + html
}
