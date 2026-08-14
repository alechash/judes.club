/* Diagrams — mermaid, rendered as paper-native plates.

   A ```mermaid fenced block in a post becomes an inline SVG figure. The
   palette is derived at runtime from the site's own CSS custom properties,
   so diagrams follow the light/dark toggle instead of shipping a second,
   drifting set of colours.

   Progressive enhancement, three ways:
     - No JS            -> the mermaid source stays visible as a code block.
     - CDN unreachable  -> same, the code block is restored.
     - Bad syntax       -> same, plus a quiet note under the block.

   Mermaid (~1MB) is fetched only on pages that actually contain a diagram.

   Authoring:

     ```mermaid
     %% caption: How a request moves through the edge
     graph LR
       A[Browser] --> B[Worker] --> C[(D1)]
     ```

   The leading `%% caption:` line is optional; when present it becomes the
   figcaption and the figure is numbered Fig. 1, Fig. 2, ... down the page. */

(function () {
  'use strict';

  var MERMAID_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11.16.1/dist/mermaid.esm.min.mjs';

  var scope = document.querySelector('.prose');
  if (!scope) return;

  /* --------------------------------------------------------------------- */
  /* Collect                                                               */
  /* --------------------------------------------------------------------- */

  var items = [];
  var claimed = [];

  function claim(host, source) {
    if (!host || claimed.indexOf(host) !== -1) return;
    var parsed = splitCaption(source);
    if (!parsed.code) return;
    claimed.push(host);
    items.push({ host: host, code: parsed.code, caption: parsed.caption });
  }

  // kramdown + rouge: <div class="language-mermaid highlighter-rouge">…<code>
  scope.querySelectorAll('div.language-mermaid').forEach(function (el) {
    claim(el, el.textContent);
  });
  // bare highlighters: <pre><code class="language-mermaid">
  scope.querySelectorAll('code.language-mermaid').forEach(function (code) {
    var pre = code.closest('pre');
    if (pre && pre.closest('div.language-mermaid')) return;
    claim(pre || code, code.textContent);
  });
  // hand-written HTML in a post
  scope.querySelectorAll('pre.mermaid, div.mermaid').forEach(function (el) {
    claim(el, el.textContent);
  });

  if (!items.length) return;

  function splitCaption(source) {
    var lines = String(source == null ? '' : source).replace(/\r/g, '').split('\n');
    while (lines.length && !lines[0].trim()) lines.shift();
    var caption = '';
    var head = lines[0] || '';
    var match = head.match(/^\s*%%\s*caption:\s*(.+?)\s*$/i);
    if (match) {
      caption = match[1].trim();   // an empty `%% caption:` is still a directive to strip
      lines.shift();
    }
    return { code: lines.join('\n').trim(), caption: caption };
  }

  /* --------------------------------------------------------------------- */
  /* Colour helpers                                                        */
  /* --------------------------------------------------------------------- */

  function token(name, fallback) {
    var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }

  function toRGB(color) {
    var c = String(color).trim();
    if (c.charAt(0) === '#') {
      if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16)];
    }
    var m = c.match(/(-?[\d.]+)/g);
    if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
    return [0, 0, 0];
  }

  function toHex(rgb) {
    return '#' + rgb.map(function (v) {
      var n = Math.max(0, Math.min(255, Math.round(v)));
      return (n < 16 ? '0' : '') + n.toString(16);
    }).join('');
  }

  // Opaque blend: `amount` of b laid over a. Mermaid does its own colour maths
  // downstream and copes badly with alpha, so everything we hand it is solid.
  function mix(a, b, amount) {
    var x = toRGB(a), y = toRGB(b);
    return toHex([
      x[0] + (y[0] - x[0]) * amount,
      x[1] + (y[1] - x[1]) * amount,
      x[2] + (y[2] - x[2]) * amount
    ]);
  }

  function isDark(color) {
    var c = toRGB(color);
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) < 128;
  }

  /* Series ramp: one ink, stepped. Nothing enters a chart that isn't already
     in the page's own colour vocabulary — series separate by weight, the way
     a printed plate does, and the accent stays reserved for emphasis. Derived
     from --bg / --text so it inverts with the theme for free. */
  var INK_STEPS = [0.8, 0.62, 0.47, 0.35, 0.25, 0.17, 0.11, 0.07];

  function inkRamp(bg, text) {
    return INK_STEPS.map(function (t) { return mix(bg, text, t); });
  }

  /* Width available to a plate. xychart in particular lays its axis labels
     out in absolute pixels, so rendering it at the real container width —
     rather than at a fixed 700 and scaling down — is the difference between
     legible tick labels and mush. */
  function plateWidth() {
    var el = items[0] && items[0].body;
    var w = el ? el.clientWidth : 0;
    return Math.max(520, Math.round(w || 600));
  }

  function config() {
    var bg     = token('--bg', '#f7f4ee');
    var text   = token('--text', '#23211c');
    var muted  = token('--muted', '#6f6a5e');
    var faint  = token('--faint', '#a59d8f');
    var line   = token('--line', '#e2dccf');
    var accent = token('--accent', '#8f4a24');
    var serif  = token('--serif', 'Charter, Georgia, serif');
    var dark   = isDark(bg);

    var fill      = mix(bg, text, dark ? 0.07 : 0.04);   // node body
    var fillAlt   = mix(bg, accent, dark ? 0.13 : 0.09); // secondary / notes
    var fillQuiet = mix(bg, text, dark ? 0.035 : 0.02);  // clusters, lanes
    var border    = mix(line, text, dark ? 0.30 : 0.34);
    var edge      = mix(muted, bg, dark ? 0.05 : 0.12);
    var series    = inkRamp(bg, text);

    var vars = {
      darkMode: dark,
      background: bg,
      fontFamily: serif,
      fontSize: '15px',

      /* Core */
      primaryColor: fill,
      primaryTextColor: text,
      primaryBorderColor: border,
      secondaryColor: fillAlt,
      secondaryTextColor: text,
      secondaryBorderColor: mix(border, accent, 0.35),
      tertiaryColor: fillQuiet,
      tertiaryTextColor: muted,
      tertiaryBorderColor: line,
      lineColor: edge,
      textColor: text,
      mainBkg: fill,
      nodeBorder: border,
      nodeTextColor: text,
      titleColor: text,
      edgeLabelBackground: bg,
      clusterBkg: fillQuiet,
      clusterBorder: line,
      defaultLinkColor: edge,
      errorBkgColor: fillAlt,
      errorTextColor: accent,

      /* Sequence */
      actorBkg: fill,
      actorBorder: border,
      actorTextColor: text,
      actorLineColor: line,
      signalColor: edge,
      signalTextColor: muted,
      labelBoxBkgColor: fillQuiet,
      labelBoxBorderColor: line,
      labelTextColor: text,
      loopTextColor: muted,
      activationBkgColor: fillAlt,
      activationBorderColor: mix(border, accent, 0.4),
      sequenceNumberColor: bg,
      noteBkgColor: fillAlt,
      noteBorderColor: mix(line, accent, 0.3),
      noteTextColor: text,

      /* State / class / ER */
      labelColor: text,
      transitionColor: edge,
      transitionLabelColor: muted,
      stateBkg: fill,
      stateBorder: border,
      altBackground: fillQuiet,
      compositeBackground: fillQuiet,
      compositeTitleBackground: mix(bg, text, dark ? 0.09 : 0.055),
      compositeBorder: line,
      innerEndBackground: text,
      specialStateColor: text,
      classText: text,
      attributeBackgroundColorOdd: fillQuiet,
      attributeBackgroundColorEven: bg,

      /* Gantt */
      sectionBkgColor: fillQuiet,
      altSectionBkgColor: bg,
      sectionBkgColor2: fillQuiet,
      gridColor: line,
      todayLineColor: accent,
      taskBkgColor: fill,
      taskBorderColor: border,
      taskTextColor: text,
      taskTextDarkColor: text,
      taskTextOutsideColor: muted,
      taskTextLightColor: bg,
      activeTaskBkgColor: fillAlt,
      activeTaskBorderColor: mix(border, accent, 0.5),
      doneTaskBkgColor: fillQuiet,
      doneTaskBorderColor: line,
      critBkgColor: mix(bg, accent, dark ? 0.22 : 0.16),
      critBorderColor: accent,

      /* Pie */
      pieTitleTextColor: text,
      pieSectionTextColor: bg,
      pieLegendTextColor: text,
      pieStrokeColor: bg,
      pieOuterStrokeColor: line,
      pieOpacity: '0.92',

      /* Quadrant */
      quadrant1Fill: fillQuiet,
      quadrant2Fill: bg,
      quadrant3Fill: fillQuiet,
      quadrant4Fill: bg,
      quadrantPointFill: accent,
      quadrantInternalBorderStrokeFill: line,
      quadrantExternalBorderStrokeFill: border,
      quadrantTitleFill: text,

      /* Misc */
      nodeBkg: fill,
      edgeLabelColor: muted,

      /* xychart keeps its own nested block */
      xyChart: {
        backgroundColor: 'transparent',
        titleColor: text,
        xAxisLabelColor: muted,
        xAxisTitleColor: muted,
        xAxisTickColor: line,
        xAxisLineColor: border,
        yAxisLabelColor: muted,
        yAxisTitleColor: muted,
        yAxisTickColor: line,
        yAxisLineColor: border,
        plotColorPalette: series.join(', ')
      }
    };

    series.forEach(function (color, i) {
      vars['pie' + (i + 1)] = color;
      vars['fillType' + i] = mix(bg, color, dark ? 0.26 : 0.18);
      vars['cScale' + i] = color;
      vars['cScaleLabel' + i] = bg;
      vars['git' + i] = color;
      vars['gitBranchLabel' + i] = bg;
    });
    // Pie can ask for twelve slices; wrap the ramp rather than fall back to
    // mermaid's defaults, which are neon next to this palette.
    for (var i = series.length; i < 12; i++) {
      vars['pie' + (i + 1)] = mix(series[i % series.length], bg, 0.3);
    }

    return {
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'base',
      fontFamily: serif,
      themeVariables: vars,
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 14, nodeSpacing: 46, rankSpacing: 54, diagramPadding: 8 },
      sequence: { useMaxWidth: true, mirrorActors: false, actorMargin: 58, boxMargin: 12, diagramMarginX: 8, diagramMarginY: 8, noteFontFamily: serif, messageFontFamily: serif, actorFontFamily: serif },
      gantt: { useMaxWidth: true, fontFamily: serif, barHeight: 18, barGap: 5, topPadding: 40, gridLineStartPadding: 32 },
      journey: { useMaxWidth: true, diagramMarginX: 8 },
      pie: { useMaxWidth: true, textPosition: 0.62 },
      er: { useMaxWidth: true, diagramPadding: 12 },
      class: { useMaxWidth: true },
      state: { useMaxWidth: true },
      timeline: { useMaxWidth: true },
      mindmap: { useMaxWidth: true },
      gitGraph: { useMaxWidth: true },
      quadrantChart: { useMaxWidth: true },
      xyChart: {
        useMaxWidth: true,
        width: plateWidth(),
        height: Math.round(Math.max(320, Math.min(460, plateWidth() * 0.56))),
        titleFontSize: 16,
        titlePadding: 12,
        plotReservedSpacePercent: 52,
        xAxis: { labelFontSize: 12, labelPadding: 6, titleFontSize: 13, titlePadding: 6, axisLineWidth: 1 },
        yAxis: { labelFontSize: 12, labelPadding: 6, titleFontSize: 13, titlePadding: 6, axisLineWidth: 1 }
      }
    };
  }

  /* --------------------------------------------------------------------- */
  /* Scaffold                                                              */
  /* --------------------------------------------------------------------- */

  var figureCount = 0;

  /* Sidenotes are absolutely positioned into the left margin on wide screens.
     Only let plates spill out of the reading column on posts that have none,
     so the two never fight over the same strip of paper. */
  var canBreakOut = !scope.querySelector('.footnotes, a.footnote');

  items.forEach(function (item) {
    var fig = document.createElement('figure');
    fig.className = canBreakOut ? 'diagram is-loading is-wide' : 'diagram is-loading';

    var body = document.createElement('div');
    body.className = 'diagram-body';
    fig.appendChild(body);

    var zoom = document.createElement('button');
    zoom.type = 'button';
    zoom.className = 'diagram-zoom';
    zoom.setAttribute('aria-label', 'Enlarge diagram');
    zoom.title = 'Enlarge';
    zoom.textContent = '⤡';
    fig.appendChild(zoom);

    if (item.caption) {
      figureCount += 1;
      var cap = document.createElement('figcaption');
      var num = document.createElement('span');
      num.className = 'diagram-num';
      num.textContent = 'Fig. ' + figureCount;
      cap.appendChild(num);
      cap.appendChild(document.createTextNode(item.caption));
      fig.appendChild(cap);
      item.label = 'Figure ' + figureCount + '. ' + item.caption;
    } else {
      item.label = 'Diagram';
    }

    item.host.parentNode.insertBefore(fig, item.host);
    item.host.remove();
    item.fig = fig;
    item.body = body;
    item.zoom = zoom;

    zoom.addEventListener('click', function () { openLightbox(item); });
  });

  function restore(item, note) {
    item.fig.classList.remove('is-loading');
    item.fig.classList.add('is-failed');
    item.body.textContent = '';
    item.zoom.remove();

    var pre = document.createElement('pre');
    var code = document.createElement('code');
    code.textContent = item.code;
    pre.appendChild(code);
    item.body.appendChild(pre);

    if (note) {
      var why = document.createElement('p');
      why.className = 'diagram-note';
      why.textContent = note;
      item.body.appendChild(why);
    }
  }

  /* --------------------------------------------------------------------- */
  /* Render                                                                */
  /* --------------------------------------------------------------------- */

  var uid = 0;
  var mermaidPromise = null;

  function loadMermaid() {
    if (!mermaidPromise) {
      mermaidPromise = import(MERMAID_URL).then(function (mod) { return mod.default || mod; });
    }
    return mermaidPromise;
  }

  function dress(item) {
    var svg = item.body.querySelector('svg');
    if (!svg) return;

    svg.removeAttribute('height');
    svg.style.maxWidth = '';
    svg.style.width = '';
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', item.label);

    var box = svg.viewBox && svg.viewBox.baseVal;
    var natural = box && box.width ? box.width : 0;
    var column = item.body.clientWidth || 600;

    // Shrinking a very wide diagram to the column makes the type unreadable;
    // past ~2x, scroll it at its natural size instead and let the lightbox
    // handle the rest.
    if (natural && natural > column * 2) {
      item.fig.classList.add('is-scroll');
      svg.style.width = Math.round(natural) + 'px';
      svg.style.minWidth = Math.round(natural) + 'px';
    } else {
      // Shrink to fit, but never blow a small diagram up to fill the column —
      // a two-actor sequence chart stretched to 800px looks like a poster.
      item.fig.classList.remove('is-scroll');
      svg.style.width = '100%';
      if (natural) svg.style.maxWidth = Math.round(natural) + 'px';
    }
    if (box && box.width && box.height) {
      item.ratio = box.height / box.width;
    }
  }

  /* Bar values straight out of the source, in order, one array per `bar [...]`
     line. Keeps the raw token as authored so 6.6 and 100 print the way they
     were written rather than the way JS decides to format them. */
  function barSeries(code) {
    var out = [];
    var re = /^[ \t]*bar[ \t]*(?:"[^"]*"[ \t]*)?\[([^\]]*)\]/gim;
    var found;
    while ((found = re.exec(code)) !== null) {
      out.push(found[1].split(',').map(function (token) {
        var raw = token.trim();
        return { raw: raw, value: parseFloat(raw) };
      }));
    }
    return out;
  }

  /* Print the value on each bar. Mermaid has no data labels, and without them
     a reader has to sight down a bar to the axis and guess. */
  function labelBars(item) {
    if (!/^\s*xychart/im.test(item.code)) return;

    var svg = item.body.querySelector('svg');
    var plot = svg && svg.querySelector('g.plot');
    if (!plot) return;

    var series = barSeries(item.code);
    var groups = plot.querySelectorAll('g[class^="bar-plot"]');
    if (!series.length || !groups.length) return;

    // Never write above the top gridline; tuck the label inside the bar instead.
    var ticks = svg.querySelector('g.left-axis g.ticks');
    var ceiling = ticks ? ticks.getBBox().y : 0;

    var SIZE = 11;
    var layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    layer.setAttribute('class', 'bar-values');
    var placed = [];

    Array.prototype.forEach.call(groups, function (group, gi) {
      var values = series[gi];
      var rects = Array.prototype.slice.call(group.querySelectorAll('rect'));
      if (!values || rects.length !== values.length) return;

      rects.forEach(function (rect, i) {
        if (!isFinite(values[i].value)) return;

        var x = parseFloat(rect.getAttribute('x')) + parseFloat(rect.getAttribute('width')) / 2;
        var top = parseFloat(rect.getAttribute('y'));
        var height = parseFloat(rect.getAttribute('height'));
        var y, inside = false;

        if (rect.classList.contains('is-negative')) {
          y = top + height + SIZE + 1;            // hangs under a falling bar
        } else if (top - 5 >= ceiling + SIZE) {
          y = top - 5;                            // normal case, sits above
        } else if (height > SIZE * 2.4) {
          y = top + SIZE + 5;                     // bar runs to the top of the scale
          inside = true;
        } else {
          y = top - 5;
        }

        // Overlaid series land two labels in one slot. If it is literally the
        // same number, print it once; if the numbers differ, both have to show,
        // so sit them side by side instead of on top of each other.
        var clash = null;
        for (var k = 0; k < placed.length; k++) {
          if (Math.abs(placed[k].x - x) < 9 && Math.abs(placed[k].y - y) < SIZE + 3) {
            clash = placed[k];
            break;
          }
        }
        if (clash) {
          if (clash.raw === values[i].raw) return;
          var shift = Math.max(9, parseFloat(rect.getAttribute('width')) * 0.3);
          clash.el.setAttribute('x', clash.x - shift);
          clash.x -= shift;
          x += shift;
        }

        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('class', inside ? 'bar-value is-inside' : 'bar-value');
        text.setAttribute('x', x);
        text.setAttribute('y', y);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', SIZE);
        text.textContent = values[i].raw;
        layer.appendChild(text);
        placed.push({ x: x, y: y, raw: values[i].raw, el: text });
      });
    });

    if (layer.childNodes.length) plot.appendChild(layer);
  }

  /* xychart-beta always grows bars up from the axis floor, so on a scale that
     crosses zero a -13 reads as a tall bar rather than a drop. Re-anchor each
     bar to the zero line — down for negatives, up for positives — and rule the
     baseline in. The pixel scale is solved from two bars whose values differ,
     which avoids depending on mermaid's internal layout numbers. */
  function rebaseline(item) {
    if (!/^\s*xychart/im.test(item.code)) return;

    var domain = item.code.match(/y-axis[^\n]*?(-?\d+(?:\.\d+)?)\s*-->\s*(-?\d+(?:\.\d+)?)/i);
    if (!domain) return;
    if (!(parseFloat(domain[1]) < 0 && parseFloat(domain[2]) > 0)) return;

    var svg = item.body.querySelector('svg');
    var plot = svg && svg.querySelector('g.plot');
    if (!plot) return;

    var series = barSeries(item.code);
    if (!series.length) return;

    var groups = plot.querySelectorAll('g[class^="bar-plot"]');
    var zeroPx = null, left = Infinity, right = -Infinity, host = null;

    Array.prototype.forEach.call(groups, function (group, gi) {
      var values = series[gi];
      var rects = Array.prototype.slice.call(group.querySelectorAll('rect'));
      if (!values || rects.length !== values.length) return;

      var a = null, b = null;
      var y0 = parseFloat(rects[0].getAttribute('y'));
      for (var i = 1; i < values.length; i++) {
        if (values[i].value === values[0].value) continue;
        b = (parseFloat(rects[i].getAttribute('y')) - y0) / (values[0].value - values[i].value);
        a = y0 + b * values[0].value;
        break;
      }
      if (b === null || !isFinite(b) || b <= 0) return;

      rects.forEach(function (rect, i) {
        var valuePx = a - b * values[i].value;
        rect.setAttribute('y', Math.min(valuePx, a));
        rect.setAttribute('height', Math.max(1, Math.abs(valuePx - a)));
        rect.classList.add(values[i].value < 0 ? 'is-negative' : 'is-positive');
        var x = parseFloat(rect.getAttribute('x'));
        left = Math.min(left, x);
        right = Math.max(right, x + parseFloat(rect.getAttribute('width')));
      });

      zeroPx = a;
      host = host || group;
    });

    if (zeroPx === null || !isFinite(left)) return;

    var rule = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    rule.setAttribute('class', 'zero-rule');
    rule.setAttribute('d', 'M' + (left - 8) + ',' + zeroPx + ' L' + (right + 8) + ',' + zeroPx);
    host.insertBefore(rule, host.firstChild);
    item.fig.classList.add('is-diverging');
  }

  /* xychart lays its category labels out horizontally and lets them collide
     when there are more categories than room. Detect the collision and lay
     them on a slant instead, then grow the canvas to fit the deeper band. */
  var TILT = 38;
  var TILT_SIN = Math.sin(TILT * Math.PI / 180);
  var TILT_COS = Math.cos(TILT * Math.PI / 180);

  function tiltAxisLabels(item) {
    var svg = item.body.querySelector('svg');
    var band = svg && svg.querySelector('g.bottom-axis g.label');
    if (!band) return;

    var labels = Array.prototype.slice.call(band.querySelectorAll('text'));
    if (labels.length < 2) return;

    // Collision has to be judged in rendered space. Each label's getBBox() is
    // local, and mermaid places them with a per-label translate, so locally
    // they all sit on top of each other and every chart would look crowded.
    var onScreen = labels.map(function (t) { return t.getBoundingClientRect(); })
                         .sort(function (p, q) { return p.left - q.left; });
    var collides = onScreen.some(function (r, i) {
      return i > 0 && onScreen[i - 1].right + 2 > r.left;
    });
    if (!collides) return;

    // Re-anchor first, then measure: the swing pivots on the end of the text,
    // so the boxes have to be the post-anchor ones.
    labels.forEach(function (t) {
      t.setAttribute('text-anchor', 'end');
      t.style.textAnchor = 'end';
    });

    labels.forEach(function (t) {
      var b = t.getBBox();
      var ax = b.x + b.width;   // pivot: end of the label, sitting at the tick
      var ay = b.y + b.height;
      var placed = t.getAttribute('transform') || '';   // mermaid's translate
      t.setAttribute('transform', (placed + ' rotate(-' + TILT + ' ' + ax + ' ' + ay + ')').trim());
    });

    // Grow the canvas to whatever the slanted band now needs, never shrink it.
    var main = svg.querySelector('g.main') || svg;
    var bb = main.getBBox();
    var vb = svg.viewBox.baseVal;
    var x0 = Math.min(vb.x, bb.x - 4);
    var y0 = Math.min(vb.y, bb.y - 4);
    var x1 = Math.max(vb.x + vb.width, bb.x + bb.width + 4);
    var y1 = Math.max(vb.y + vb.height, bb.y + bb.height + 6);
    svg.setAttribute('viewBox', [x0, y0, x1 - x0, y1 - y0].join(' '));

    item.fig.classList.add('is-tilted');
    dress(item);
  }

  function renderOne(mermaid, item) {
    var id = 'mermaid-' + (++uid);
    return mermaid.parse(item.code)
      .then(function () { return mermaid.render(id, item.code); })
      .then(function (result) {
        item.body.innerHTML = result.svg;
        item.svg = result.svg;
        if (result.bindFunctions) result.bindFunctions(item.body);
        dress(item);
        rebaseline(item);
        labelBars(item);
        tiltAxisLabels(item);
        item.fig.classList.remove('is-loading');
        item.fig.classList.add('is-ready');
      })
      .catch(function (err) {
        if (item.fig.classList.contains('is-ready')) return; // a re-theme failed; keep what works
        restore(item, 'This diagram could not be drawn: ' + (err && err.message ? err.message.split('\n')[0] : 'unknown error'));
      });
  }

  function renderAll() {
    return loadMermaid().then(function (mermaid) {
      mermaid.initialize(config());
      return items.reduce(function (chain, item) {
        return chain.then(function () { return renderOne(mermaid, item); });
      }, Promise.resolve());
    }).catch(function () {
      items.forEach(function (item) {
        if (!item.fig.classList.contains('is-ready')) restore(item, null);
      });
    });
  }

  /* --------------------------------------------------------------------- */
  /* Lightbox                                                              */
  /* --------------------------------------------------------------------- */

  var lightbox = null;

  function openLightbox(item) {
    var svg = item.body.querySelector('svg');
    if (!svg) return;

    closeLightbox();

    lightbox = document.createElement('div');
    lightbox.className = 'diagram-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', item.label);

    var stage = document.createElement('div');
    stage.className = 'dl-stage';
    var clone = svg.cloneNode(true);
    clone.removeAttribute('id');
    clone.style.width = '';
    clone.style.minWidth = '';
    clone.style.maxWidth = '';
    stage.appendChild(clone);
    lightbox.appendChild(stage);

    if (item.caption) {
      var cap = document.createElement('p');
      cap.className = 'dl-caption';
      cap.textContent = item.caption;
      lightbox.appendChild(cap);
    }

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'dl-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    lightbox.appendChild(close);

    document.body.appendChild(lightbox);
    document.body.classList.add('diagram-open');
    requestAnimationFrame(function () { lightbox.classList.add('in'); });
    close.focus();

    close.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', function (e) {
      if (e.target === lightbox || e.target === stage) closeLightbox();
    });
    document.addEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape') closeLightbox();
  }

  function closeLightbox() {
    if (!lightbox) return;
    lightbox.remove();
    lightbox = null;
    document.body.classList.remove('diagram-open');
    document.removeEventListener('keydown', onKey);
  }

  /* --------------------------------------------------------------------- */
  /* Follow the theme                                                      */
  /* --------------------------------------------------------------------- */

  var pending = null;

  function rerender() {
    clearTimeout(pending);
    pending = setTimeout(function () {
      closeLightbox();
      renderAll();
    }, 60);
  }

  new MutationObserver(rerender).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });

  var systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  if (systemDark.addEventListener) systemDark.addEventListener('change', rerender);

  var resizeTimer = null;
  var lastWidth = plateWidth();
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      var now = plateWidth();
      // Charts bake their axis layout in at render time; a real width change
      // needs a redraw, anything smaller just needs re-fitting.
      if (Math.abs(now - lastWidth) > 40) {
        lastWidth = now;
        renderAll();
        return;
      }
      items.forEach(function (item) {
        if (item.fig.classList.contains('is-ready')) dress(item);
      });
    }, 180);
  });

  renderAll();
})();
