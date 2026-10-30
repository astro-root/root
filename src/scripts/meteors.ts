// 流れ星。設定は <body data-meteors="low|normal|high">（管理画面で変更）。
// 負荷対策: 同時最大3本 / DPR上限 / タブ非表示時は停止 / モバイルは頻度半減 / reduced-motion では無効
interface Meteor { x: number; y: number; vx: number; vy: number; len: number; life: number; age: number }

export function initMeteors() {
  const level = document.body.dataset.meteors as 'low' | 'normal' | 'high' | undefined;
  if (!level) return;
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  if (mq.matches) return;

  const canvas = document.createElement('canvas');
  canvas.id = 'meteors';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }

  const small = matchMedia('(max-width: 720px)').matches || (navigator.hardwareConcurrency ?? 8) <= 4;
  const base = { low: 7000, normal: 3600, high: 1800 }[level] ?? 3600;
  const interval = small ? base * 2 : base;
  const maxLive = small ? 2 : 3;
  const dpr = Math.min(window.devicePixelRatio || 1, small ? 1 : 1.5);

  let w = 0, h = 0, raf = 0, last = 0, nextSpawn = 600;
  const meteors: Meteor[] = [];

  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function spawn() {
    const angle = (Math.PI / 180) * (28 + Math.random() * 14); // 右上→左下へ斜め
    const speed = 520 + Math.random() * 380;
    meteors.push({
      x: w * (0.25 + Math.random() * 0.85), y: -20 - Math.random() * h * 0.25,
      vx: -Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      len: 90 + Math.random() * 120, life: 1.1 + Math.random() * 0.7, age: 0
    });
  }
  function color() {
    return getComputedStyle(document.documentElement).getPropertyValue('--meteor').trim() || '170, 215, 255';
  }
  function frame(t: number) {
    const dt = Math.min((t - last) / 1000, 0.05); last = t;
    ctx!.clearRect(0, 0, w, h);
    nextSpawn -= dt * 1000;
    if (nextSpawn <= 0) {
      if (meteors.length < maxLive) spawn();
      nextSpawn = interval * (0.6 + Math.random() * 0.9);
    }
    const rgb = color();
    for (let i = meteors.length - 1; i >= 0; i--) {
      const m = meteors[i];
      m.age += dt; m.x += m.vx * dt; m.y += m.vy * dt;
      const p = m.age / m.life;
      if (p >= 1 || m.y > h + 40 || m.x < -m.len) { meteors.splice(i, 1); continue; }
      const alpha = Math.sin(Math.PI * Math.min(p, 1)) * 0.85;
      const sp = Math.hypot(m.vx, m.vy);
      const tx = m.x - (m.vx / sp) * m.len, ty = m.y - (m.vy / sp) * m.len;
      const g = ctx!.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(${rgb}, ${alpha})`); g.addColorStop(1, `rgba(${rgb}, 0)`);
      ctx!.strokeStyle = g; ctx!.lineWidth = 1.6; ctx!.lineCap = 'round';
      ctx!.beginPath(); ctx!.moveTo(m.x, m.y); ctx!.lineTo(tx, ty); ctx!.stroke();
    }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  resize();
  addEventListener('resize', resize, { passive: true });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  mq.addEventListener('change', (e) => { if (e.matches) { stop(); canvas.remove(); } });
  start();
}
