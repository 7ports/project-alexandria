"use strict";

// docs/assets/embedding-map.js
// Shared, build-step-free native-ESM module for Project Alexandria's 3D embedding map.
// Exports initEmbeddingMap(opts); consumed by explore.html (full) and the index.html hero (later).
// Reads the global window.Plotly (loaded via the pinned gl3d CDN <script> + SRI on each page).

// Fallback categorical palette for clusters (Plotly/Vega "Tableau10"-ish).
var CLUSTER_PALETTE = [
  "#4C78A8", "#F58518", "#54A24B", "#E45756", "#72B7B2",
  "#EECA3B", "#B279A2", "#FF9DA6", "#9D755D", "#BAB0AC", "#1F77B4"
];

// ---- live semantic search constants (button-gated, lazy Transformers.js) ----
var TRANSFORMERS_CDN = "https://esm.sh/@huggingface/transformers@3.6.3";
var SEARCH_TOP_N = 8;
var GUIDE_DIM = 384;

// ---- relational edge underlay styling ----
var EDGE_LINE_COLOR = "rgba(139,148,158,0.22)";

export function hasWebGL() {
  try {
    var c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (e) { return false; }
}

export function initEmbeddingMap(opts) {
  opts = opts || {};
  var features = opts.features || {};
  var wantSearch = features.search === true;
  // features.edges is a no-op-safe capability flag here; edge rendering lands in a later task.
  var wantEdges = features.edges === true;
  var heightMode = opts.heightMode === "hero" ? "hero" : "full";
  var dataUrl = opts.dataUrl || "./data/embedding-map.json";

  function pick(optEl, id) {
    if (optEl) return typeof optEl === "string" ? document.getElementById(optEl) : optEl;
    return document.getElementById(id);
  }

  var statusEl = pick(opts.statusEl, "status");
  var plotEl = pick(opts.mount, "plot");
  var controlsEl = pick(opts.controlsEl, "controls");
  var hintEl = pick(opts.hintEl, "hint");
  var fallbackEl = pick(opts.fallbackEl, "fallback");
  var metaNote = pick(opts.metaNoteEl, "meta-note");

  if (plotEl) plotEl.classList.add("map-" + heightMode);

  if (!hasWebGL()) {
    if (statusEl) statusEl.style.display = "none";
    if (plotEl) plotEl.style.display = "none";
    if (fallbackEl) fallbackEl.style.display = "block";
    return;
  }

  var state = { gran: "doc", color: "cluster", edges: "off" };
  var DATA = null;
  var tagById = {};
  var searchHighlight = [];

  function pointSet() { return state.gran === "doc" ? DATA.docs : DATA.chunks; }

  function colorForGroup(key) {
    if (state.color === "tag") {
      var t = tagById[key];
      return (t && t.color) || "#888";
    }
    return CLUSTER_PALETTE[(Number(key) || 0) % CLUSTER_PALETTE.length];
  }

  function groupName(key) {
    if (state.color === "tag") {
      var t = tagById[key];
      return (t && t.label) || String(key);
    }
    return "Cluster " + key;
  }

  function buildEdgeTrace() {
    if (!wantEdges || state.gran !== "doc" || state.edges === "off") return null;
    if (!DATA || !DATA.edges) return null;
    var set = state.edges === "knn" ? DATA.edges.knn : DATA.edges.threshold;
    if (!set || !set.length) return null;
    var docs = DATA.docs;
    var x = [], y = [], z = [];
    for (var i = 0; i < set.length; i++) {
      var s = docs[set[i].s], t = docs[set[i].t];
      if (!s || !t) continue;
      x.push(s.pos[0], t.pos[0], null);
      y.push(s.pos[1], t.pos[1], null);
      z.push(s.pos[2], t.pos[2], null);
    }
    return {
      type: "scatter3d",
      mode: "lines",
      x: x, y: y, z: z,
      line: { color: EDGE_LINE_COLOR, width: 1.5 },
      hoverinfo: "skip",
      showlegend: false
    };
  }

  function buildTraces() {
    var pts = pointSet();
    var groups = {};
    var order = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      var key = state.color === "tag" ? p.tag : p.cluster;
      if (!(key in groups)) { groups[key] = []; order.push(key); }
      groups[key].push(p);
    }
    // stable, readable legend order
    order.sort(function (a, b) {
      if (state.color === "tag") return String(groupName(a)).localeCompare(String(groupName(b)));
      return Number(a) - Number(b);
    });

    var traces = [];
    for (var g = 0; g < order.length; g++) {
      var key = order[g];
      var arr = groups[key];
      var x = [], y = [], z = [], custom = [];
      for (var j = 0; j < arr.length; j++) {
        var d = arr[j];
        x.push(d.pos[0]); y.push(d.pos[1]); z.push(d.pos[2]);
        var tagLabel = (tagById[d.tag] && tagById[d.tag].label) || d.tag;
        // customdata: [url, title, tagLabel, cluster, heading]
        custom.push([d.url, d.title, tagLabel, d.cluster, d.heading || ""]);
      }
      var isChunk = state.gran === "chunk";
      var hover = isChunk
        ? "<b>%{customdata[1]}</b><br>%{customdata[4]}<br>Tag: %{customdata[2]}<br>Cluster: %{customdata[3]}<extra></extra>"
        : "<b>%{customdata[1]}</b><br>Tag: %{customdata[2]}<br>Cluster: %{customdata[3]}<extra></extra>";
      traces.push({
        type: "scatter3d",
        mode: "markers",
        name: groupName(key),
        x: x, y: y, z: z,
        customdata: custom,
        hovertemplate: hover,
        marker: {
          size: isChunk ? 3 : 6,
          color: colorForGroup(key),
          opacity: isChunk ? 0.7 : 0.9,
          line: { width: 0 }
        }
      });
    }
    if (searchHighlight.length && DATA && DATA.docs) {
      var hx = [], hy = [], hz = [], hcustom = [];
      for (var h = 0; h < searchHighlight.length; h++) {
        var hd = DATA.docs[searchHighlight[h].docIndex];
        if (!hd) continue;
        hx.push(hd.pos[0]); hy.push(hd.pos[1]); hz.push(hd.pos[2]);
        hcustom.push([hd.url, hd.title, "", "", ""]);
      }
      traces.push({
        type: "scatter3d",
        mode: "markers",
        name: "Search matches",
        x: hx, y: hy, z: hz,
        customdata: hcustom,
        hovertemplate: "<b>%{customdata[1]}</b><br>search match<extra></extra>",
        marker: {
          size: 12,
          color: "#e3b341",
          symbol: "circle-open",
          opacity: 1,
          line: { width: 2, color: "#e3b341" }
        }
      });
    }
    var edgeTrace = buildEdgeTrace();
    if (edgeTrace) traces.unshift(edgeTrace); // underlay at index 0; markers draw on top
    return traces;
  }

  function layout() {
    var ax = {
      showgrid: true, gridcolor: "#21262d", zeroline: false,
      showticklabels: false, title: "",
      backgroundcolor: "#0d1117", showbackground: true
    };
    return {
      paper_bgcolor: "#0d1117",
      plot_bgcolor: "#0d1117",
      font: { color: "#e6edf3", family: "-apple-system, Segoe UI, sans-serif" },
      margin: { l: 0, r: 0, t: 0, b: 0 },
      showlegend: true,
      legend: { bgcolor: "rgba(22,27,34,0.7)", bordercolor: "#30363d", borderwidth: 1, font: { size: 11 } },
      scene: {
        xaxis: ax, yaxis: Object.assign({}, ax), zaxis: Object.assign({}, ax),
        aspectmode: "cube"
      }
    };
  }

  var CONFIG = { responsive: true, displaylogo: false,
    modeBarButtonsToRemove: ["toImage"] };

  function render() {
    if (wantEdges) updateEdgesEnabled();
    var pts = pointSet();
    if (metaNote) {
      metaNote.textContent = pts.length + " " + (state.gran === "doc" ? "guides" : "chunks") +
        " · colored by " + state.color;
    }
    window.Plotly.react(plotEl, buildTraces(), layout(), CONFIG);
  }

  function wireSeg(id, attr, key) {
    var seg = document.getElementById(id);
    if (!seg) return;
    seg.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn || btn.disabled) return;
      var val = btn.getAttribute(attr);
      if (!val || state[key] === val) return;
      state[key] = val;
      var btns = seg.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) btns[i].classList.remove("active");
      btn.classList.add("active");
      render();
    });
  }

  function updateEdgesEnabled() {
    var seg = document.getElementById("seg-edges");
    if (!seg) return;
    var group = document.getElementById("edges-control-group");
    var disabled = state.gran !== "doc";
    var btns = seg.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) btns[i].disabled = disabled;
    if (group) {
      group.style.opacity = disabled ? "0.45" : "";
      group.title = disabled ? "Edges are guide-level" : "";
    }
  }

  function initEdges() {
    if (!controlsEl) return;
    var group = document.createElement("div");
    group.className = "control-group";
    group.id = "edges-control-group";
    var label = document.createElement("span");
    label.className = "label";
    label.textContent = "Edges";
    var seg = document.createElement("div");
    seg.className = "seg";
    seg.id = "seg-edges";
    var states = [["off", "Off"], ["knn", "kNN"], ["threshold", "Threshold"]];
    for (var i = 0; i < states.length; i++) {
      var b = document.createElement("button");
      b.setAttribute("data-edges", states[i][0]);
      b.textContent = states[i][1];
      if (states[i][0] === state.edges) b.className = "active";
      seg.appendChild(b);
    }
    group.appendChild(label);
    group.appendChild(seg);
    if (metaNote && metaNote.parentNode === controlsEl) {
      controlsEl.insertBefore(group, metaNote);
    } else {
      controlsEl.appendChild(group);
    }
    wireSeg("seg-edges", "data-edges", "edges");
    updateEdgesEnabled();
  }

  // ---- live semantic search (button-gated, lazy Transformers.js) ----
  var embedder = null;    // feature-extraction pipeline, loaded only on "Enable search"
  var guideVecs = null;   // Float32Array of shipped doc-centroid vectors
  var searchReady = false;

  function searchSupported() {
    var hasWasm = (typeof WebAssembly === "object" && typeof WebAssembly.instantiate === "function");
    var hasGPU = (typeof navigator !== "undefined" && !!navigator.gpu);
    return hasWasm || hasGPU;
  }

  function dotAt(buf, off, q) {
    var s = 0;
    for (var i = 0; i < GUIDE_DIM; i++) s += buf[off + i] * q[i];
    return s;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderResults(list) {
    var el = document.getElementById("results");
    var html = '<div class="results-head">Nearest guides</div>';
    for (var i = 0; i < list.length; i++) {
      var d = DATA.docs[list[i].docIndex];
      html += '<div class="result-row" data-url="' + escapeHtml(d.url) + '">' +
        '<span><span class="rank">' + (i + 1) + '</span>' + escapeHtml(d.title) + '</span>' +
        '<span class="score">' + list[i].score.toFixed(3) + '</span></div>';
    }
    el.innerHTML = html;
    el.classList.add("show");
    var rows = el.querySelectorAll(".result-row");
    for (var j = 0; j < rows.length; j++) {
      rows[j].addEventListener("click", function () {
        var u = this.getAttribute("data-url");
        if (u) window.location.href = u;
      });
    }
  }

  function runQuery(q) {
    var st = document.getElementById("search-status");
    q = (q || "").trim();
    if (!q) {
      searchHighlight = [];
      document.getElementById("results").classList.remove("show");
      render();
      return;
    }
    if (!searchReady || !embedder || !guideVecs) return;
    st.className = "search-status";
    st.textContent = "Searching…";
    Promise.resolve()
      .then(function () {
        // query: prefix — passages were embedded with passage:, queries MUST use query:
        return embedder("query: " + q, { pooling: "mean", normalize: true });
      })
      .then(function (out) {
        var qv = out.data; // Float32Array(384), L2-normalized → cosine == dot product
        var scored = [];
        for (var r = 0; r < DATA.docs.length; r++) {
          var idx = DATA.docs[r].vecIndex;
          scored.push({ docIndex: r, score: dotAt(guideVecs, idx * GUIDE_DIM, qv) });
        }
        scored.sort(function (a, b) { return b.score - a.score; });
        searchHighlight = scored.slice(0, SEARCH_TOP_N);
        // live search operates on doc granularity — switch the view so ring positions match
        if (state.gran !== "doc") {
          state.gran = "doc";
          var gseg = document.getElementById("seg-gran");
          var gb = gseg.querySelectorAll("button");
          for (var i = 0; i < gb.length; i++) {
            gb[i].classList.toggle("active", gb[i].getAttribute("data-gran") === "doc");
          }
        }
        renderResults(searchHighlight);
        render();
        st.textContent = "Top " + searchHighlight.length + " matches for “" + q + "”";
      })
      .catch(function (err) {
        st.className = "search-status error";
        st.textContent = "Search failed: " + err.message;
      });
  }

  function enableSearch() {
    var btn = document.getElementById("enable-search");
    var input = document.getElementById("search-input");
    var st = document.getElementById("search-status");
    btn.disabled = true;
    st.className = "search-status";
    st.textContent = "Loading model… 0%";

    var vecsP = fetch("./data/guide-vectors.bin")
      .then(function (r) { if (!r.ok) throw new Error("vectors HTTP " + r.status); return r.arrayBuffer(); })
      .then(function (buf) { guideVecs = new Float32Array(buf); });

    var modelP = import(TRANSFORMERS_CDN)
      .then(function (mod) {
        return mod.pipeline("feature-extraction", "Xenova/bge-small-en-v1.5", {
          progress_callback: function (p) {
            if (p && p.status === "progress" && typeof p.progress === "number") {
              st.textContent = "Loading model… " + Math.round(p.progress) + "%";
            } else if (p && p.status) {
              st.textContent = "Loading model… " + p.status;
            }
          }
        });
      })
      .then(function (pipe) { embedder = pipe; });

    Promise.all([vecsP, modelP])
      .then(function () {
        searchReady = true;
        input.disabled = false;
        input.focus();
        st.textContent = "Ready — type a query and press Enter.";
      })
      .catch(function (err) {
        btn.disabled = false;
        st.className = "search-status error";
        st.textContent = "Could not enable search: " + err.message;
      });
  }

  function initSearch() {
    var bar = document.getElementById("search-bar");
    var btn = document.getElementById("enable-search");
    var input = document.getElementById("search-input");
    var st = document.getElementById("search-status");
    bar.classList.add("show");
    if (!searchSupported()) {
      btn.disabled = true;
      input.disabled = true;
      st.className = "search-status error";
      st.textContent = "Live search unavailable: this browser lacks WebAssembly/WebGPU support.";
      return;
    }
    btn.addEventListener("click", enableSearch);
    var t = null;
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { if (t) clearTimeout(t); runQuery(input.value); }
    });
    input.addEventListener("input", function () {
      if (t) clearTimeout(t);
      t = setTimeout(function () { runQuery(input.value); }, 450);
    });
  }

  fetch(dataUrl)
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (json) {
      DATA = json;
      (json.tags || []).forEach(function (t) { tagById[t.id] = t; });

      if (statusEl) statusEl.style.display = "none";
      if (controlsEl) controlsEl.style.display = "flex";
      if (hintEl) hintEl.style.display = "block";

      window.Plotly.newPlot(plotEl, buildTraces(), layout(), CONFIG).then(function () {
        plotEl.on("plotly_click", function (ev) {
          if (!ev || !ev.points || !ev.points.length) return;
          var cd = ev.points[0].customdata;
          var url = cd && cd[0];
          if (url) window.location.href = url;
        });
      });

      wireSeg("seg-gran", "data-gran", "gran");
      wireSeg("seg-color", "data-color", "color");
      if (wantEdges) initEdges();
      if (wantSearch) initSearch();
      render();
    })
    .catch(function (err) {
      if (statusEl) {
        statusEl.className = "msg error";
        statusEl.textContent = "Failed to load embedding map: " + err.message;
      }
    });
}
