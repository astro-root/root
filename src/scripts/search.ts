interface Hit { kind: 'project' | 'post' | 'page'; title: string; href: string; snippet: string; meta: string }
const GROUPS: Record<Hit['kind'], string> = { project: 'Projects', post: 'Blog', page: 'Pages' };

function highlight(el: HTMLElement, text: string, terms: string[]) {
  el.textContent = '';
  const safe = terms.filter(Boolean).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!safe.length) { el.textContent = text; return; }
  const re = new RegExp(`(${safe.join('|')})`, 'gi');
  text.split(re).forEach((part, i) => {
    if (i % 2 === 1) { const m = document.createElement('mark'); m.textContent = part; el.append(m); }
    else if (part) el.append(document.createTextNode(part));
  });
}

export function initSearch() {
  const dialog = document.getElementById('search-dialog') as HTMLDialogElement | null;
  const input = document.getElementById('search-input') as HTMLInputElement | null;
  const results = document.getElementById('search-results');
  const status = document.getElementById('search-status');
  const form = document.getElementById('search-form') as HTMLFormElement | null;
  if (!dialog || !input || !results || !form || typeof dialog.showModal !== 'function') return;

  let timer: number | undefined;
  let ctrl: AbortController | undefined;
  let items: HTMLAnchorElement[] = [];
  let active = -1;

  const open = () => { if (!dialog.open) dialog.showModal(); input.focus(); input.select(); };
  const close = () => dialog.open && dialog.close();

  document.getElementById('search-open')?.addEventListener('click', open);
  document.getElementById('search-close')?.addEventListener('click', close);
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  // Escapeは標準動作に任せず明示的に閉じる（ブラウザごとのCloseWatcher制限に依存しないため）
  dialog.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); close(); } });
  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
    if ((e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
      e.preventDefault(); open();
    }
  });

  function select(i: number) {
    items.forEach((a, n) => a.setAttribute('aria-selected', String(n === i)));
    active = i;
    if (items[i]) { items[i].scrollIntoView({ block: 'nearest' }); input!.setAttribute('aria-activedescendant', items[i].id); }
  }

  function render(hits: Hit[], q: string) {
    results!.textContent = '';
    items = []; active = -1;
    const terms = q.normalize('NFKC').split(/\s+/).filter(Boolean);
    if (!hits.length) {
      const p = document.createElement('p');
      p.className = 'search-empty';
      p.textContent = `「${q}」に一致する結果はありません。`;
      results!.append(p);
      if (status) status.textContent = '一致する結果はありません';
      return;
    }
    (['project', 'post', 'page'] as const).forEach((kind) => {
      const group = hits.filter((h) => h.kind === kind);
      if (!group.length) return;
      const h = document.createElement('div');
      h.className = 'search-group'; h.textContent = GROUPS[kind]; h.setAttribute('role', 'presentation');
      results!.append(h);
      group.forEach((hit) => {
        const a = document.createElement('a');
        a.href = hit.href; a.className = 'search-item'; a.setAttribute('role', 'option');
        a.id = `sr-${items.length}`; a.setAttribute('aria-selected', 'false');
        const s = document.createElement('strong'); highlight(s, hit.title, terms);
        const sp = document.createElement('span'); highlight(sp, hit.snippet, terms);
        a.append(s, sp);
        results!.append(a); items.push(a);
      });
    });
    if (status) status.textContent = `${hits.length}件の結果`;
  }

  async function run() {
    const q = input!.value.trim();
    if (!q) { results!.textContent = ''; items = []; if (status) status.textContent = ''; return; }
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { hits: Hit[] };
      render(data.hits, q);
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      results!.textContent = '';
      const p = document.createElement('p'); p.className = 'search-empty'; p.textContent = '検索に失敗しました。時間をおいてお試しください。';
      results!.append(p);
    }
  }

  input.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(run, 180); });
  input.addEventListener('keydown', (e) => {
    if (e.isComposing) return; // 日本語入力の変換確定のEnterを除外
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) select((active + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) select((active - 1 + items.length) % items.length); }
    else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); items[active].click(); }
  });
  form.addEventListener('submit', (e) => { if (!input.value.trim()) e.preventDefault(); });
  dialog.addEventListener('close', () => { input.removeAttribute('aria-activedescendant'); });
}
