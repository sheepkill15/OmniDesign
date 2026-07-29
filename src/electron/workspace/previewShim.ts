// A tiny script OmniDesign injects into every previewed page. It is served, never committed to Git,
// and never authored by the agent. It runs inside the sandboxed, opaque-origin iframe and talks to the
// trusted parent only through postMessage. Four jobs:
//   1. report content height (ResizeObserver) so the parent can size an Artboard-fit tile to the page;
//   2. forward console output and window.onerror as preview diagnostics (the Phase 1 diagnostics
//      feature, which would otherwise regress once the preview is an iframe);
//   3. report its own page path on load so the focused-mode switcher stays in sync when in-page links
//      are followed.
//   4. support a temporary inspection mode that reports only an opaque source key and bounded label;
//      the trusted side resolves authoritative paths and lines from its immutable source map.
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
  var selecting = false;
  var highlighted = null;
  var focusedAnchors = [];
  var focusedAnchorFrame = 0;
  var selectionStyle = document.createElement('style');
  selectionStyle.textContent = '.od-focused-candidate{outline:3px solid Highlight !important;outline-offset:2px !important;cursor:crosshair !important;}.od-focused-label{position:fixed;z-index:2147483647;display:none;max-width:min(320px,calc(100vw - 16px));padding:5px 8px;border:2px solid Highlight;border-radius:4px;background:Canvas;color:CanvasText;font:600 12px/1.25 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.25);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}@media(forced-colors:active){.od-focused-label{forced-color-adjust:auto;box-shadow:none;}}';
  (document.head || document.documentElement).appendChild(selectionStyle);
  var selectionLabel = document.createElement('div');
  selectionLabel.className = 'od-focused-label';
  selectionLabel.setAttribute('aria-hidden', 'true');
  document.documentElement.appendChild(selectionLabel);
  function elementLabel(element) {
    if (!element || !element.tagName) return 'element';
    var label = '<' + element.tagName.toLowerCase();
    if (element.id) label += '#' + String(element.id).slice(0, 80);
    var classes = typeof element.className === 'string' ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 2) : [];
    classes.forEach(function (name) { if (name !== 'od-focused-candidate') label += '.' + String(name).slice(0, 60); });
    return (label + '>').slice(0, 200);
  }
  function authoredAncestor(node) {
    var element = node && node.nodeType === 1 ? node : (node && node.parentElement);
    while (element && !element.getAttribute('data-od-source-key')) element = element.parentElement;
    return element;
  }
  function anchorRect(element) {
    if (!element || !element.getBoundingClientRect) return null;
    var rect = element.getBoundingClientRect();
    var values = [rect.left, rect.top, rect.right, rect.bottom, rect.width, rect.height];
    if (values.some(function (value) { return typeof value !== 'number' || !isFinite(value); })) return null;
    var viewportWidth = Math.max(1, Math.min(100000, window.innerWidth || 1));
    var viewportHeight = Math.max(1, Math.min(100000, window.innerHeight || 1));
    if (rect.width <= 0 || rect.height <= 0 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewportWidth || rect.top >= viewportHeight) return null;
    return {
      left: Math.max(-100000, Math.min(100000, rect.left)),
      top: Math.max(-100000, Math.min(100000, rect.top)),
      right: Math.max(-100000, Math.min(100000, rect.right)),
      bottom: Math.max(-100000, Math.min(100000, rect.bottom)),
      width: Math.max(0, Math.min(100000, rect.width)),
      height: Math.max(0, Math.min(100000, rect.height)),
      viewportWidth: viewportWidth,
      viewportHeight: viewportHeight
    };
  }
  function findSourceElement(locationId) {
    var elements = document.querySelectorAll('[data-od-source-key]');
    for (var index = 0; index < elements.length; index += 1) {
      if (elements[index].getAttribute('data-od-source-key') === locationId) return elements[index];
    }
    return null;
  }
  function reportFocusedAnchors() {
    focusedAnchorFrame = 0;
    if (!focusedAnchors.length) { post({ type: 'focused-anchors', anchors: [] }); return; }
    var anchors = focusedAnchors.map(function (item) {
      var rect = anchorRect(findSourceElement(item.locationId));
      return rect ? { id: item.id, locationId: item.locationId, rect: rect } : null;
    }).filter(Boolean);
    post({ type: 'focused-anchors', anchors: anchors });
  }
  function scheduleFocusedAnchors() {
    if (focusedAnchorFrame) return;
    focusedAnchorFrame = window.requestAnimationFrame ? window.requestAnimationFrame(reportFocusedAnchors) : window.setTimeout(reportFocusedAnchors, 16);
  }
  function highlight(node) {
    if (highlighted) highlighted.classList.remove('od-focused-candidate');
    highlighted = authoredAncestor(node);
    if (selecting && highlighted) {
      highlighted.classList.add('od-focused-candidate');
      selectionLabel.textContent = elementLabel(node);
      var rect = highlighted.getBoundingClientRect();
      selectionLabel.style.left = Math.max(8, Math.min(window.innerWidth - 328, rect.left)) + 'px';
      selectionLabel.style.top = Math.max(8, rect.top - 31) + 'px';
      selectionLabel.style.display = 'block';
    } else selectionLabel.style.display = 'none';
  }
  function clearHighlight() {
    if (highlighted) highlighted.classList.remove('od-focused-candidate');
    highlighted = null;
    selectionLabel.style.display = 'none';
  }
  function stopSelecting() {
    selecting = false;
    clearHighlight();
  }
  function choose(node) {
    var clicked = node && node.nodeType === 1 ? node : (node && node.parentElement);
    var authored = authoredAncestor(clicked);
    if (!authored) { post({ type: 'selection-unmappable', clickedLabel: elementLabel(clicked) }); clearHighlight(); return; }
    post({ type: 'selection', locationId: authored.getAttribute('data-od-source-key'), clickedLabel: elementLabel(clicked), usedAncestor: authored !== clicked, rect: anchorRect(authored) });
    clearHighlight();
  }
  document.addEventListener('mouseover', function (event) { if (selecting) highlight(event.target); }, true);
  document.addEventListener('focusin', function (event) { if (selecting) highlight(event.target); }, true);
  document.addEventListener('click', function (event) {
    if (!selecting) return;
    event.preventDefault(); event.stopPropagation(); if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    choose(event.target);
  }, true);
  document.addEventListener('keydown', function (event) {
    if (!selecting) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stopSelecting(); post({ type: 'selection-cancelled' }); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); choose(event.target); }
  }, true);
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
    window.addEventListener('resize', scheduleFocusedAnchors);
    window.addEventListener('scroll', scheduleFocusedAnchors, true);
    // The parent asks for a fresh measurement after a layout-affecting change (device size / fit mode).
    window.addEventListener('message', function (event) {
      if (!event.data) return;
      if (event.data.type === 'omnidesign-measure') reportHeight();
      else if (event.data.type === 'omnidesign-pause') setPaused(true);
      else if (event.data.type === 'omnidesign-resume') setPaused(false);
      else if (event.data.type === 'omnidesign-selection-start') { selecting = true; highlight(document.activeElement || document.body); }
      else if (event.data.type === 'omnidesign-selection-stop') stopSelecting();
      else if (event.data.type === 'omnidesign-focused-anchors') {
        var incoming = Array.isArray(event.data.anchors) ? event.data.anchors.slice(0, 201) : [];
        focusedAnchors = incoming.filter(function (item) {
          return item && typeof item.id === 'string' && item.id.length <= 100 && typeof item.locationId === 'string' && item.locationId.length <= 100;
        });
        scheduleFocusedAnchors();
      }
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
