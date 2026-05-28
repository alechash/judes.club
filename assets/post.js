/* Post enhancements: margin sidenotes + sticky TOC with scroll-spy.
   Progressive enhancement over kramdown footnotes + heading IDs.
   With JS off, posts fall back to bottom footnotes and no TOC. */
(function () {
  var grid = document.querySelector('.article-grid');
  if (!grid) return;
  var article = document.querySelector('.article');
  var prose = grid.querySelector('.prose');
  if (!prose) return;

  var WIDE = window.matchMedia('(min-width: 1080px)');
  var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)');
  var HOVERABLE = window.matchMedia('(hover: hover) and (pointer: fine)');
  var HGAP = 36; // px between a sidenote and the reading column
  var VGAP = 16; // px between stacked sidenotes

  /* --------------------------------------------------------------------- */
  /* Sidenotes                                                             */
  /* --------------------------------------------------------------------- */
  var sidenotes = [];

  (function buildSidenotes() {
    var list = prose.querySelector('.footnotes');
    if (!list) return;
    var items = list.querySelectorAll('li[id^="fn:"]');
    if (!items.length) return;

    items.forEach(function (li) {
      var marker = prose.querySelector('a.footnote[href="#' + li.id + '"]') ||
                   prose.querySelector('a[href="#' + li.id + '"]');
      if (!marker) return;

      var aside = document.createElement('aside');
      aside.className = 'sidenote';
      aside.id = 'sn-' + li.id.replace(':', '-');

      var num = document.createElement('span');
      num.className = 'sn-num';
      num.textContent = marker.textContent.trim();

      var clone = li.cloneNode(true);
      var rev = clone.querySelector('a.reversefootnote');
      if (rev) rev.remove();
      var firstP = clone.querySelector('p');
      if (firstP) firstP.insertBefore(num, firstP.firstChild);
      else aside.appendChild(num);
      while (clone.firstChild) aside.appendChild(clone.firstChild);

      // Insert as a direct child of .prose, right after the block that
      // references the note (so it appears inline on narrow screens).
      var node = marker;
      while (node.parentNode && node.parentNode !== prose) node = node.parentNode;
      prose.insertBefore(aside, node.nextSibling);

      marker.setAttribute('aria-controls', aside.id);
      marker.setAttribute('aria-expanded', 'false');
      marker.addEventListener('click', function (e) {
        e.preventDefault();
        if (WIDE.matches) {
          flash(aside);
        } else {
          var open = aside.classList.toggle('open');
          marker.setAttribute('aria-expanded', open ? 'true' : 'false');
        }
      });

      sidenotes.push({ aside: aside, marker: marker, previewHTML: aside.innerHTML });
    });

    if (sidenotes.length && article) article.classList.add('sidenotes-ready');
  })();

  if (HOVERABLE.matches && sidenotes.length) setupFootnotePreviews();

  function flash(el) {
    el.style.transition = 'none';
    el.style.color = 'var(--text)';
    requestAnimationFrame(function () {
      el.style.transition = 'color 1s var(--ease)';
      el.style.color = '';
    });
  }

  function topWithin(el, ancestor) {
    var y = 0;
    while (el && el !== ancestor) { y += el.offsetTop; el = el.offsetParent; }
    return y;
  }

  /* Hover/focus preview popover for footnote markers (pointer devices). */
  function setupFootnotePreviews() {
    var pop = document.createElement('div');
    pop.className = 'fn-popover';
    pop.setAttribute('role', 'note');
    pop.hidden = true;
    document.body.appendChild(pop);

    var showT, hideT, current = null;

    function place(marker) {
      pop.hidden = false;
      var m = marker.getBoundingClientRect();
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var vw = document.documentElement.clientWidth;
      var left = Math.min(Math.max(12, m.left + m.width / 2 - pw / 2), vw - pw - 12);
      var top = m.top - ph - 10, below = false;
      if (top < 76) { top = m.bottom + 10; below = true; } // clear the fixed navbar
      pop.style.left = Math.round(left) + 'px';
      pop.style.top = Math.round(top) + 'px';
      pop.classList.toggle('below', below);
    }
    function show(marker, html) {
      clearTimeout(hideT);
      current = marker;
      pop.innerHTML = html;
      place(marker);
      requestAnimationFrame(function () { pop.classList.add('in'); });
    }
    function hide() {
      clearTimeout(showT);
      hideT = setTimeout(function () {
        current = null;
        pop.classList.remove('in');
        setTimeout(function () { if (!current) pop.hidden = true; }, 180);
      }, 160);
    }

    sidenotes.forEach(function (s) {
      s.marker.addEventListener('mouseenter', function () {
        clearTimeout(hideT);
        showT = setTimeout(function () { show(s.marker, s.previewHTML); }, 110);
      });
      s.marker.addEventListener('mouseleave', hide);
      s.marker.addEventListener('focus', function () { show(s.marker, s.previewHTML); });
      s.marker.addEventListener('blur', hide);
    });
    pop.addEventListener('mouseenter', function () { clearTimeout(hideT); });
    pop.addEventListener('mouseleave', hide);
    window.addEventListener('scroll', function () { if (current) hide(); }, { passive: true });
  }

  function layoutSidenotes() {
    if (!sidenotes.length) return;

    if (!WIDE.matches) {
      sidenotes.forEach(function (s) {
        s.aside.style.left = s.aside.style.width = s.aside.style.top = '';
      });
      return;
    }

    var padL = parseFloat(getComputedStyle(grid).paddingLeft) || 0;
    var width = prose.offsetLeft - padL - HGAP;
    if (width < 90) { // gutter collapsed; let CSS govern (inline)
      sidenotes.forEach(function (s) {
        s.aside.style.left = s.aside.style.width = s.aside.style.top = '';
      });
      return;
    }

    var prevBottom = -Infinity;
    sidenotes.forEach(function (s) {
      s.aside.style.left = padL + 'px';
      s.aside.style.width = width + 'px';
      var desired = topWithin(s.marker, grid);
      var top = Math.max(desired, prevBottom + VGAP);
      s.aside.style.top = top + 'px';
      prevBottom = top + s.aside.offsetHeight;
    });
  }

  /* --------------------------------------------------------------------- */
  /* Table of contents                                                     */
  /* --------------------------------------------------------------------- */
  var toc = grid.querySelector('.toc');
  var tocLinks = [];

  (function buildToc() {
    if (!toc) return;
    var body = toc.querySelector('.toc-body');
    var heads = prose.querySelectorAll('h2, h3');
    if (!body || heads.length < 2) { toc.remove(); toc = null; return; }

    var ul = document.createElement('ul');
    heads.forEach(function (h) {
      if (!h.id) h.id = slugify(h.textContent);
      var li = document.createElement('li');
      if (h.tagName === 'H3') li.className = 'toc-h3';
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      a.addEventListener('click', function (e) {
        e.preventDefault();
        h.scrollIntoView({ behavior: REDUCE.matches ? 'auto' : 'smooth', block: 'start' });
        history.pushState(null, '', '#' + h.id);
        if (!WIDE.matches) toc.classList.add('collapsed');
      });
      li.appendChild(a);
      ul.appendChild(li);
      tocLinks.push({ a: a, id: h.id, head: h });
    });
    body.appendChild(ul);
    toc.hidden = false;

    var title = toc.querySelector('.toc-title');
    if (title) title.addEventListener('click', function () {
      if (!WIDE.matches) toc.classList.toggle('collapsed');
    });
    if (!WIDE.matches) toc.classList.add('collapsed');
  })();

  function setActive(id) {
    tocLinks.forEach(function (t) { t.a.classList.toggle('active', t.id === id); });
  }

  function updateActive() {
    if (!tocLinks.length) return;
    var line = 120; // detection line just below the fixed navbar
    var active = tocLinks[0].id;
    for (var i = 0; i < tocLinks.length; i++) {
      if (tocLinks[i].head.getBoundingClientRect().top - line <= 0) active = tocLinks[i].id;
      else break;
    }
    setActive(active);
  }

  function slugify(s) {
    return s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
  }

  /* --------------------------------------------------------------------- */
  /* Heading anchor links                                                  */
  /* --------------------------------------------------------------------- */
  prose.querySelectorAll('h2, h3').forEach(function (h) {
    if (!h.id) h.id = slugify(h.textContent);
    if (h.querySelector('.heading-anchor')) return;
    var a = document.createElement('a');
    a.className = 'heading-anchor';
    a.href = '#' + h.id;
    a.textContent = '#';
    a.setAttribute('aria-label', 'Copy link to this section');
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var url = location.origin + location.pathname + '#' + h.id;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          a.classList.add('copied');
          setTimeout(function () { a.classList.remove('copied'); }, 1100);
        }).catch(function () {});
      }
      history.replaceState(null, '', '#' + h.id);
      h.scrollIntoView({ behavior: REDUCE.matches ? 'auto' : 'smooth', block: 'start' });
    });
    h.appendChild(a);
  });

  /* --------------------------------------------------------------------- */
  /* Reading progress                                                      */
  /* --------------------------------------------------------------------- */
  var progress = document.createElement('div');
  progress.className = 'read-progress';
  progress.setAttribute('aria-hidden', 'true');
  document.body.appendChild(progress);
  function updateProgress() {
    var doc = document.documentElement;
    var max = doc.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, (window.scrollY || doc.scrollTop) / max)) : 0;
    progress.style.transform = 'scaleX(' + p + ')';
  }

  /* --------------------------------------------------------------------- */
  /* Orchestration                                                         */
  /* --------------------------------------------------------------------- */
  var rid;
  function relayout() { clearTimeout(rid); rid = setTimeout(layoutSidenotes, 60); }

  function onModeChange() {
    if (WIDE.matches) {
      sidenotes.forEach(function (s) {
        s.aside.classList.remove('open');
        s.marker.setAttribute('aria-expanded', 'false');
      });
      if (toc) toc.classList.remove('collapsed');
    } else if (toc) {
      toc.classList.add('collapsed');
    }
    layoutSidenotes();
    updateActive();
  }

  window.addEventListener('resize', function () { relayout(); updateProgress(); }, { passive: true });
  window.addEventListener('load', function () { layoutSidenotes(); updateProgress(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutSidenotes);
  if ('ResizeObserver' in window) new ResizeObserver(function () { relayout(); updateProgress(); }).observe(prose);
  if (WIDE.addEventListener) WIDE.addEventListener('change', onModeChange);
  else if (WIDE.addListener) WIDE.addListener(onModeChange);

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { updateActive(); updateProgress(); ticking = false; });
  }, { passive: true });

  layoutSidenotes();
  updateActive();
  updateProgress();
  requestAnimationFrame(layoutSidenotes);
})();
