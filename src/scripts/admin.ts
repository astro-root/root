// 管理画面の共通クライアント処理。すべての変更はサーバー側API（認証・CSRF・検証あり）を経由する。
const csrf = () => document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';

export async function api(url: string, opts: { method?: string; body?: unknown; form?: FormData } = {}) {
  const headers: Record<string, string> = { 'X-CSRF-Token': csrf(), Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  const res = await fetch(url, { method: opts.method ?? 'POST', headers, body, credentials: 'same-origin' });
  if (res.status === 401) { location.href = '/admin/login'; throw new Error('unauthorized'); }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

function toast(msg: string, kind: 'ok' | 'error' = 'ok') {
  const box = document.getElementById('toasts');
  if (!box) return;
  const t = document.createElement('div');
  t.className = `toast toast--${kind}`;
  t.textContent = msg;
  box.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500);
}

// ---------------------------------------------------------------- 共通UI
const root = document.documentElement;
document.getElementById('theme-toggle')?.addEventListener('click', () => {
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  root.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch { /* noop */ }
});
const admToggle = document.getElementById('adm-toggle');
const scrim = document.getElementById('adm-scrim');
function setSide(open: boolean) {
  document.body.classList.toggle('adm-open', open);
  admToggle?.setAttribute('aria-expanded', String(open));
  if (scrim) scrim.hidden = !open;
}
admToggle?.addEventListener('click', () => setSide(!document.body.classList.contains('adm-open')));
scrim?.addEventListener('click', () => setSide(false));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setSide(false); });
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await api('/api/admin/logout').catch(() => {});
  location.href = '/admin/login';
});

// ---------------------------------------------------------------- フォーム値の収集
function setPath(obj: Record<string, any>, path: string, val: unknown) {
  const keys = path.split('.');
  let o = obj;
  keys.slice(0, -1).forEach((k) => { o = o[k] ??= {}; });
  o[keys[keys.length - 1]] = val;
}
function readEl(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): unknown {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'number') return el.value === '' ? '' : Number(el.value);
  }
  return el.value;
}
function collect(form: HTMLFormElement) {
  const out: Record<string, any> = {};
  form.querySelectorAll<HTMLInputElement>('[name]').forEach((el) => {
    if (el.closest('[data-repeater]') || el.disabled || el.type === 'file' || el.type === 'button' || el.type === 'submit') return;
    if (el.type === 'radio' && !el.checked) return;
    setPath(out, el.name, readEl(el));
  });
  form.querySelectorAll<HTMLElement>('[data-repeater]').forEach((rep) => {
    const rows = [...rep.querySelectorAll<HTMLElement>(':scope > [data-rows] > [data-row]')].map((row) => {
      const o: Record<string, unknown> = {};
      row.querySelectorAll<HTMLInputElement>('[data-k]').forEach((el) => { o[el.dataset.k!] = readEl(el); });
      return o;
    });
    setPath(out, rep.dataset.repeater!, rows);
  });
  return out;
}

// ---------------------------------------------------------------- エラー表示
function clearErrors(form: HTMLElement) {
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  form.querySelectorAll('.field-error').forEach((e) => { e.textContent = ''; });
  form.querySelector('.error-summary')?.remove();
}
function locate(form: HTMLElement, key: string): HTMLElement | null {
  const m = key.match(/^(.+)\.(\d+)\.(\w+)$/);
  if (m) {
    const rep = form.querySelector<HTMLElement>(`[data-repeater="${CSS.escape(m[1])}"]`);
    const row = rep?.querySelectorAll<HTMLElement>(':scope > [data-rows] > [data-row]')[Number(m[2])];
    return row?.querySelector<HTMLElement>(`[data-k="${m[3]}"]`) ?? null;
  }
  return form.querySelector<HTMLElement>(`[name="${CSS.escape(key)}"]`);
}
function showErrors(form: HTMLElement, errors: Record<string, string>) {
  clearErrors(form);
  const list: string[] = [];
  let first: HTMLElement | null = null;
  for (const [k, msg] of Object.entries(errors)) {
    list.push(msg);
    const el = locate(form, k);
    if (el) {
      el.setAttribute('aria-invalid', 'true');
      first ??= el;
      const field = el.closest('.field');
      if (field) {
        let p = field.querySelector<HTMLElement>('.field-error');
        if (!p) { p = document.createElement('p'); p.className = 'field-error'; field.append(p); }
        p.textContent = msg;
      }
    }
  }
  const box = document.createElement('div');
  box.className = 'notice notice--error error-summary';
  box.setAttribute('role', 'alert'); box.tabIndex = -1;
  const h = document.createElement('strong'); h.textContent = '入力内容を確認してください。';
  const ul = document.createElement('ul');
  [...new Set(list)].forEach((m) => { const li = document.createElement('li'); li.textContent = m; ul.append(li); });
  box.append(h, ul);
  form.prepend(box);
  (first ?? box).focus();
}

// ---------------------------------------------------------------- 繰り返し項目
function initRepeater(rep: HTMLElement) {
  const rows = rep.querySelector<HTMLElement>(':scope > [data-rows]')!;
  const tpl = rep.querySelector<HTMLTemplateElement>(':scope > template')!;
  const max = Number(rep.dataset.max ?? 20);
  const addBtn = rep.querySelector<HTMLButtonElement>('[data-add]');
  const empty = rep.querySelector<HTMLElement>(':scope > .rep-empty');
  const refresh = () => {
    const n = rows.querySelectorAll(':scope > [data-row]').length;
    if (addBtn) addBtn.disabled = n >= max;
    if (empty) empty.hidden = n > 0;
  };
  addBtn?.addEventListener('click', () => {
    const node = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
    rows.append(node); refresh();
    rep.closest('form')?.dispatchEvent(new Event('input', { bubbles: true }));
    node.querySelector<HTMLElement>('input,select,textarea')?.focus();
  });
  rows.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-remove],button[data-up],button[data-down]');
    if (!btn) return;
    const row = btn.closest<HTMLElement>('[data-row]')!;
    if (btn.hasAttribute('data-remove')) row.remove();
    else if (btn.hasAttribute('data-up') && row.previousElementSibling) row.previousElementSibling.before(row);
    else if (btn.hasAttribute('data-down') && row.nextElementSibling) row.nextElementSibling.after(row);
    refresh(); btn.isConnected && btn.focus();
    rep.closest('form')?.dispatchEvent(new Event('input', { bubbles: true }));
  });
  refresh();
}
document.querySelectorAll<HTMLElement>('[data-repeater]').forEach(initRepeater);

// ---------------------------------------------------------------- Markdownエディタ
function initMarkdown(ta: HTMLTextAreaElement) {
  const wrap = document.createElement('div');
  wrap.className = 'md'; wrap.dataset.view = 'edit';
  const labelId = ta.id;
  wrap.innerHTML = `
    <div class="md__bar" role="toolbar" aria-label="Markdown書式">
      <button type="button" data-a="h2" title="見出し2">H2</button>
      <button type="button" data-a="h3" title="見出し3">H3</button>
      <button type="button" data-a="bold" title="太字 (Ctrl+B)"><b>B</b></button>
      <button type="button" data-a="italic" title="斜体 (Ctrl+I)"><i>I</i></button>
      <button type="button" data-a="code" title="コード">&lt;/&gt;</button>
      <button type="button" data-a="codeblock" title="コードブロック">{ }</button>
      <button type="button" data-a="link" title="リンク (Ctrl+K)">リンク</button>
      <button type="button" data-a="ul" title="箇条書き">• リスト</button>
      <button type="button" data-a="ol" title="番号付きリスト">1. リスト</button>
      <button type="button" data-a="quote" title="引用">❝</button>
      <button type="button" data-a="hr" title="区切り線">―</button>
      <button type="button" data-a="image" title="画像をアップロードして挿入">画像</button>
      <span class="sp"></span>
      <span class="md__tabs"><button type="button" data-view="edit" aria-pressed="true">編集</button><button type="button" data-view="preview" aria-pressed="false">プレビュー</button></span>
    </div>
    <div class="md__panes"></div>
    <div class="md__foot"><span data-count></span><span>Markdown / 生HTMLは無効化されます · Ctrl+S で保存</span></div>`;
  ta.before(wrap);
  const panes = wrap.querySelector<HTMLElement>('.md__panes')!;
  panes.append(ta);
  const preview = document.createElement('div');
  preview.className = 'md__preview'; preview.setAttribute('aria-label', 'プレビュー'); preview.setAttribute('aria-live', 'off');
  preview.innerHTML = '<div class="prose"></div>';
  panes.append(preview);
  const prose = preview.firstElementChild as HTMLElement;
  const count = wrap.querySelector<HTMLElement>('[data-count]')!;
  ta.setAttribute('spellcheck', 'false');
  const initial = ta.value;
  const key = `mddraft:${location.pathname}${location.search}:${ta.name}`;

  // --- 編集中内容の保護（未保存の下書きをブラウザに退避し、復元を提案）
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const d = JSON.parse(raw) as { v: string; t: number };
      if (d.v !== initial) {
        const bar = document.createElement('div');
        bar.className = 'notice md__restore';
        bar.innerHTML = '<strong>保存されていない下書きが見つかりました。</strong> <span data-when></span> ';
        bar.querySelector('[data-when]')!.textContent = `(${new Date(d.t).toLocaleString('ja-JP')})`;
        const r = document.createElement('button'); r.type = 'button'; r.className = 'btn btn--sm btn--primary'; r.textContent = '復元する';
        const x = document.createElement('button'); x.type = 'button'; x.className = 'btn btn--sm'; x.textContent = '破棄する'; x.style.marginLeft = '0.4rem';
        r.onclick = () => { ta.value = d.v; ta.dispatchEvent(new Event('input', { bubbles: true })); bar.remove(); };
        x.onclick = () => { localStorage.removeItem(key); bar.remove(); };
        bar.append(r, x);
        wrap.before(bar);
      }
    }
  } catch { /* localStorageが使えなくても編集は可能 */ }
  let saveT: number | undefined;
  const stash = () => {
    clearTimeout(saveT);
    saveT = window.setTimeout(() => {
      try { if (ta.value === initial) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify({ v: ta.value, t: Date.now() })); } catch { /* noop */ }
    }, 600);
  };
  ta.closest('form')?.addEventListener('saved', () => { try { localStorage.removeItem(key); } catch { /* noop */ } });

  // --- プレビュー（公開ページと同じサニタイズ済みレンダラーをサーバーで実行）
  let composing = false, pt: number | undefined, ctrl: AbortController | undefined;
  async function renderPreview() {
    ctrl?.abort(); ctrl = new AbortController();
    try {
      const res = await fetch('/api/admin/preview', { method: 'POST', signal: ctrl.signal, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf() }, body: JSON.stringify({ md: ta.value }) });
      if (!res.ok) throw new Error(String(res.status));
      prose.innerHTML = ((await res.json()) as { html: string }).html;
    } catch (e) { if ((e as Error).name !== 'AbortError') prose.textContent = 'プレビューを取得できませんでした。'; }
  }
  const schedule = () => { clearTimeout(pt); pt = window.setTimeout(renderPreview, 350); };
  const updateCount = () => { count.textContent = `${ta.value.length.toLocaleString()} 文字`; };
  ta.addEventListener('compositionstart', () => { composing = true; });
  ta.addEventListener('compositionend', () => { composing = false; schedule(); }); // 日本語変換中は更新しない
  ta.addEventListener('input', () => { updateCount(); stash(); if (!composing) schedule(); });
  updateCount(); renderPreview();

  // --- ツールバー
  const edit = (fn: (sel: string) => { text: string; select?: [number, number] }) => {
    const s = ta.selectionStart, e = ta.selectionEnd;
    const r = fn(ta.value.slice(s, e));
    ta.setRangeText(r.text, s, e, 'end');
    if (r.select) ta.setSelectionRange(s + r.select[0], s + r.select[1]);
    ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const surround = (a: string, b: string, ph: string) => edit((sel) => { const t = sel || ph; return { text: a + t + b, select: [a.length, a.length + t.length] }; });
  const lines = (fn: (l: string, i: number) => string) => {
    let s = ta.selectionStart; const e = ta.selectionEnd;
    s = ta.value.lastIndexOf('\n', s - 1) + 1;
    const block = ta.value.slice(s, e) || '';
    ta.setRangeText(block.split('\n').map(fn).join('\n'), s, e, 'end');
    ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const actions: Record<string, () => void> = {
    h2: () => lines((l) => '## ' + l.replace(/^#+\s*/, '')), h3: () => lines((l) => '### ' + l.replace(/^#+\s*/, '')),
    bold: () => surround('**', '**', '太字'), italic: () => surround('*', '*', '斜体'), code: () => surround('`', '`', 'code'),
    codeblock: () => edit((sel) => ({ text: '\n```\n' + (sel || 'code') + '\n```\n' })),
    link: () => edit((sel) => { const t = sel || 'リンクテキスト'; return { text: `[${t}](https://)`, select: [t.length + 3, t.length + 11] }; }),
    ul: () => lines((l) => '- ' + l), ol: () => lines((l, i) => `${i + 1}. ` + l), quote: () => lines((l) => '> ' + l),
    hr: () => edit(() => ({ text: '\n\n---\n\n' })),
    image: () => uploadFile((url) => edit((sel) => ({ text: `![${sel || '画像の説明'}](${url})` })))
  };
  wrap.querySelector('.md__bar')!.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!b) return;
    if (b.dataset.a) actions[b.dataset.a]?.();
    if (b.dataset.view) {
      wrap.dataset.view = b.dataset.view;
      wrap.querySelectorAll<HTMLButtonElement>('.md__tabs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      if (b.dataset.view === 'preview') renderPreview();
    }
  });
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.isComposing) return;
    const k = e.key.toLowerCase();
    if (k === 'b') { e.preventDefault(); actions.bold(); } else if (k === 'i') { e.preventDefault(); actions.italic(); } else if (k === 'k') { e.preventDefault(); actions.link(); }
  });
  void labelId;
}

// ---------------------------------------------------------------- 画像アップロード
function uploadFile(done: (url: string) => void) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.onchange = async () => {
    const f = input.files?.[0];
    if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    toast('アップロード中…');
    const r = await api('/api/admin/media', { form: fd });
    if (r.ok) { done(r.data.url); toast('アップロードしました'); }
    else toast(r.data?.errors?.file ?? 'アップロードに失敗しました', 'error');
  };
  input.click();
}
document.querySelectorAll<HTMLButtonElement>('[data-upload]').forEach((b) => b.addEventListener('click', () => {
  uploadFile((url) => {
    const t = document.querySelector<HTMLInputElement>(b.dataset.upload!);
    if (t) { t.value = url; t.dispatchEvent(new Event('input', { bubbles: true })); }
  });
}));
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(b.dataset.copy!); toast('コピーしました'); } catch { toast('コピーできませんでした', 'error'); }
}));

// ---------------------------------------------------------------- フォーム送信
let anyDirty = false;
window.addEventListener('beforeunload', (e) => { if (anyDirty) { e.preventDefault(); e.returnValue = ''; } });

document.querySelectorAll<HTMLFormElement>('form[data-admin-form]').forEach((form) => {
  const state = form.querySelector<HTMLElement>('[data-savestate]');
  const btn = form.querySelector<HTMLButtonElement>('button[type=submit]');
  const setState = (s: 'saved' | 'dirty' | 'saving' | 'error', text: string) => { if (state) { state.dataset.s = s; state.textContent = text; } };
  let sending = false;

  form.querySelectorAll<HTMLTextAreaElement>('textarea[data-md]').forEach(initMarkdown);

  const markDirty = () => { anyDirty = true; setState('dirty', '未保存の変更があります'); };
  form.addEventListener('input', markDirty);
  form.addEventListener('change', markDirty);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (sending) return; // 二重送信防止
    sending = true;
    if (btn) btn.disabled = true;
    setState('saving', '保存中…');
    clearErrors(form);
    let payload: any = collect(form);
    if (form.dataset.wrapKey) payload = { key: form.dataset.wrapKey, value: form.dataset.arrayValue ? payload[form.dataset.arrayValue] : payload };
    try {
      const r = await api(form.dataset.endpoint!, { method: form.dataset.method ?? 'POST', body: payload });
      if (r.ok) {
        anyDirty = false;
        form.dispatchEvent(new Event('saved'));
        setState('saved', `保存しました（${new Date().toLocaleTimeString('ja-JP')}）`);
        toast('保存しました');
        const field = form.dataset.afterField;
        if (field && form.dataset.after) {
          const original = (form.querySelector<HTMLInputElement>('[name=original]')?.value) ?? '';
          const nv = r.data[field];
          if (nv && nv !== original) location.href = form.dataset.after + encodeURIComponent(nv);
          else if (nv) { const o = form.querySelector<HTMLInputElement>('[name=original]'); if (o) o.value = nv; }
        }
        if (form.dataset.reload === '1') location.reload();
      } else if (r.data?.errors) {
        showErrors(form, r.data.errors);
        setState('error', '入力エラーがあります');
      } else {
        setState('error', r.data?.message ?? `保存に失敗しました（${r.status}）`);
        toast(r.data?.message ?? '保存に失敗しました。もう一度お試しください。', 'error');
      }
    } catch (err) {
      if ((err as Error).message !== 'unauthorized') { setState('error', '通信エラー'); toast('通信エラーが発生しました。入力内容は保持されています。', 'error'); }
    } finally {
      sending = false;
      if (btn) btn.disabled = false;
    }
  });
});
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const f = (document.activeElement as HTMLElement | null)?.closest<HTMLFormElement>('form[data-admin-form]') ?? document.querySelector<HTMLFormElement>('form[data-admin-form]');
    if (f) { e.preventDefault(); f.requestSubmit(); }
  }
});

// ---------------------------------------------------------------- 削除
document.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach((b) => b.addEventListener('click', async () => {
  if (!confirm(b.dataset.confirm ?? 'この操作は元に戻せません。削除しますか？')) return;
  b.disabled = true;
  const r = await api(b.dataset.delete!, { method: 'DELETE' });
  if (r.ok) {
    anyDirty = false;
    if (b.dataset.toast) toast(b.dataset.toast.replace('{n}', String(r.data.deleted ?? '')));
    if (b.dataset.after) location.href = b.dataset.after; else setTimeout(() => location.reload(), b.dataset.toast ? 700 : 0);
  } else { b.disabled = false; toast(r.data?.errors ? Object.values(r.data.errors).join(' ') : '削除に失敗しました', 'error'); }
}));
