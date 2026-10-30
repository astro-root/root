import { initSearch } from './search';
import { initMeteors } from './meteors';

// ---- テーマ
const root = document.documentElement;
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch { /* 保存できなくても動作する */ }
});

// ---- モバイルメニュー
const toggle = document.getElementById('nav-toggle');
const menu = document.getElementById('mobile-menu');
function setMenu(open: boolean) {
  if (!toggle || !menu) return;
  menu.hidden = !open;
  toggle.setAttribute('aria-expanded', String(open));
  toggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  document.body.style.overflow = open ? 'hidden' : '';
}
toggle?.addEventListener('click', () => setMenu(menu?.hidden ?? true));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu && !menu.hidden) { setMenu(false); toggle?.focus(); } });
matchMedia('(min-width: 861px)').addEventListener('change', (e) => { if (e.matches) setMenu(false); });

// ---- オープニング演出（セッション中1回）
const intro = document.getElementById('intro');
if (intro) {
  if (root.classList.contains('intro-on')) {
    const done = () => {
      intro.classList.add('is-out');
      try { sessionStorage.setItem('intro', '1'); } catch { /* noop */ }
      setTimeout(() => { root.classList.remove('intro-on'); intro.remove(); }, 700);
    };
    const t = setTimeout(done, 1300);
    intro.addEventListener('click', () => { clearTimeout(t); done(); });
  } else {
    intro.remove();
  }
}

// ---- スクロール表示
if (root.classList.contains('reveal-on')) {
  const els = document.querySelectorAll<HTMLElement>('.reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    els.forEach((el) => io.observe(el));
  } else els.forEach((el) => el.classList.add('is-in'));
}

initSearch();
initMeteors();
