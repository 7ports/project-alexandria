// docs/assets/theme.js — light/dark theme for every page.
// Load synchronously in <head> (after theme.css) so the right theme is set before first paint.
// Follows the OS colour scheme until the visitor picks one with a [data-theme-toggle] button;
// the choice is remembered in localStorage. Dispatches `themechange` on document after a switch.
(function () {
  var KEY = 'alexandria-theme';
  var root = document.documentElement;
  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function stored() {
    try { var v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; }
    catch (e) { return null; }
  }
  function system() { return mq && mq.matches ? 'light' : 'dark'; }

  function syncButtons() {
    var t = root.getAttribute('data-theme');
    var next = t === 'dark' ? 'light' : 'dark';
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].setAttribute('aria-label', 'Switch to ' + next + ' theme');
      btns[i].setAttribute('title', 'Switch to ' + next + ' theme');
      var label = btns[i].querySelector('.theme-toggle-label');
      if (label) label.textContent = next === 'light' ? 'Light' : 'Dark';
    }
  }

  function apply(t) {
    root.setAttribute('data-theme', t);
    syncButtons();
    try { document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } })); } catch (e) {}
  }

  root.setAttribute('data-theme', stored() || system());

  if (mq) {
    var onChange = function () { if (!stored()) apply(system()); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  window.alexandriaTheme = {
    get: function () { return root.getAttribute('data-theme'); },
    set: function (t) {
      if (t !== 'light' && t !== 'dark') return;
      try { localStorage.setItem(KEY, t); } catch (e) {}
      apply(t);
    },
    toggle: function () { this.set(this.get() === 'dark' ? 'light' : 'dark'); }
  };

  function wire() {
    var btns = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () { window.alexandriaTheme.toggle(); });
    }
    syncButtons();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
