// ╔══════════════════════════════════════════════════════════════╗
// ║  线性回归 — SyncClassroom 互动课件                                ║
// ║  TypeScript + React · 需配合 SyncEngine 补丁使用               ║
// ║  课程时长：约 40 分钟                               ║
// ╚══════════════════════════════════════════════════════════════╝

const { useState, useEffect, useRef } = React;

// ══════════════════════════════════════════════════════════════
//  数据与算法
// ══════════════════════════════════════════════════════════════

// 原始数据（来自 Typst 源文件中的 cetz 散点）
const EV_DATA: [number, number][] = [
  [20, 7.1], [30, 4.8], [40, 8.2], [50, 9.5],
  [60, 13.3], [70, 15.1], [80, 11.8],
];

interface LSResult { k: number; b: number; sse: number }

function leastSquares(pts: [number, number][]): LSResult {
  const n = pts.length;
  if (n < 2) return { k: 0, b: pts[0]?.[1] ?? 0, sse: 0 };
  const sx  = pts.reduce((s, p) => s + p[0], 0);
  const sy  = pts.reduce((s, p) => s + p[1], 0);
  const sxy = pts.reduce((s, p) => s + p[0] * p[1], 0);
  const sx2 = pts.reduce((s, p) => s + p[0] * p[0], 0);
  const denom = n * sx2 - sx * sx;
  if (Math.abs(denom) < 1e-10) return { k: 0, b: sy / n, sse: 0 };
  const k = (n * sxy - sx * sy) / denom;
  const b = (sy - k * sx) / n;
  const sse = pts.reduce((s, p) => { const e = p[1] - (k * p[0] + b); return s + e * e; }, 0);
  return { k, b, sse };
}

function computeSSE(pts: [number, number][], k: number, b: number): number {
  return pts.reduce((s, p) => { const e = p[1] - (k * p[0] + b); return s + e * e; }, 0);
}

// ══════════════════════════════════════════════════════════════
//  设计语言（与 Typst metropolis 主题保持一致）
// ══════════════════════════════════════════════════════════════
const C_BLUE   = '#185FA5';
const C_ORANGE = '#D85A30';
const C_GREEN  = '#1D9E75';
const C_DARK   = '#212529';
const C_MUTED  = '#6c757d';

// ── KaTeX CSS 注入（dependency 机制只支持 JS，CSS 手动处理）──
(function injectKatexCss() {
  const id = 'katex-css-injected';
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = '/lib/katex.min.css';
  link.onerror = () => { link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css'; };
  document.head.appendChild(link);
})();

// ══════════════════════════════════════════════════════════════
//  共用小组件
// ══════════════════════════════════════════════════════════════

interface InfoBoxProps { title?: string; children: React.ReactNode; type?: 'info' | 'warn' | 'ok' }
function InfoBox({ title, children, type = 'info' }: InfoBoxProps) {
  const palette = {
    info: { bg: '#e8f4f8', leftBorder: C_BLUE,   titleColor: C_BLUE   },
    warn: { bg: '#fff3e0', leftBorder: C_ORANGE,  titleColor: C_ORANGE },
    ok:   { bg: '#e8f5e9', leftBorder: C_GREEN,   titleColor: C_GREEN  },
  }[type];
  return (
    <div style={{
      background: palette.bg,
      borderRadius: 6,
      borderLeft: `4px solid ${palette.leftBorder}`,
      border: `0.5px solid ${palette.leftBorder}44`,
      borderLeftWidth: 4,
      padding: '10px 14px',
      marginBottom: 12,
    }}>
      {title && <div style={{ color: palette.titleColor, fontWeight: 'bold', marginBottom: 5 }}>{title}</div>}
      <div style={{ color: C_DARK, lineHeight: 1.65 }}>{children}</div>
    </div>
  );
}

function Circle({ n, color = C_BLUE }: { n: string | number; color?: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: '50%',
      background: color, color: 'white', fontWeight: 'bold', fontSize: 14, flexShrink: 0,
    }}>{n}</span>
  );
}

function Badge({ text, color = C_BLUE }: { text: string; color?: string }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 4,
      background: color + '22', border: `0.5px solid ${color}`,
      color, fontWeight: 'bold', fontSize: '0.85em',
    }}>{text}</span>
  );
}

function FormulaBox({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: '#f0f4ff', border: `1px solid #85B7EB`,
      borderRadius: 6, padding: '10px 16px',
      textAlign: 'center', margin: '8px 0',
    }}>{children}</div>
  );
}

// KaTeX 公式渲染组件
function K({ tex, display = false }: { tex: string; display?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const katex = (window as any).katex;
    if (ref.current && katex) {
      try {
        katex.render(tex, ref.current, { displayMode: display, throwOnError: false });
      } catch {}
    }
  });
  return <span ref={ref} />;
}

// 课程顶部标题栏
function SlideHeader({ title }: { title: React.ReactNode }) {
  return (
    <h2 style={{
      color: C_BLUE,
      borderBottom: `3px solid ${C_BLUE}`,
      paddingBottom: 8, marginBottom: 18, marginTop: 0,
      fontSize: '1.4rem',
    }}>{title}</h2>
  );
}

// ══════════════════════════════════════════════════════════════
//  Canvas 散点图工具
// ══════════════════════════════════════════════════════════════
interface PlotDims {
  cw: number; ch: number;
  padL: number; padR: number; padT: number; padB: number;
}

function makePlotUtils(dims: PlotDims) {
  const { cw, ch, padL, padR, padT, padB } = dims;
  const W = cw - padL - padR;
  const H = ch - padT - padB;
  const X_MIN = 0, X_MAX = 110, Y_MIN = 0, Y_MAX = 22;
  return {
    W, H,
    px: (x: number) => padL + (x - X_MIN) / (X_MAX - X_MIN) * W,
    py: (y: number) => padT + H - (y - Y_MIN) / (Y_MAX - Y_MIN) * H,
    toData: (cx: number, cy: number): [number, number] => {
      const x = ((cx - padL) / W) * (X_MAX - X_MIN) + X_MIN;
      const y = ((padT + H - cy) / H) * (Y_MAX - Y_MIN) + Y_MIN;
      return [Math.round(x / 5) * 5, Math.round(y * 2) / 2];
    },
    X_MAX, Y_MAX,
  };
}

// HiDPI canvas helper — 让 canvas 内部缓冲区 = 逻辑尺寸 × devicePixelRatio
// 调用后返回已 scale 好的 ctx，后续绘图直接用逻辑坐标即可
function getCtx(canvas: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

// ResizeObserver hook — canvas 跟随容器动态伸缩
function useCanvasDims(padL: number, padR: number, padT: number, padB: number) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<PlotDims>({ cw: 400, ch: 300, padL, padR, padT, padB });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      if (width > 20 && height > 20)
        setDims({ cw: Math.floor(width), ch: Math.floor(height), padL, padR, padT, padB });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return { wrapRef, dims };
}

function drawScatterBase(
  ctx: CanvasRenderingContext2D,
  dims: PlotDims,
  utils: ReturnType<typeof makePlotUtils>
) {
  const { cw, ch, padL, padT } = dims;
  const { W, H, px, py } = utils;

  ctx.clearRect(0, 0, cw, ch);

  // 网格
  ctx.strokeStyle = '#e0ddd8'; ctx.lineWidth = 0.5;
  for (const xi of [20, 40, 60, 80, 100]) {
    ctx.beginPath(); ctx.moveTo(px(xi), padT); ctx.lineTo(px(xi), padT + H); ctx.stroke();
  }
  for (const yi of [5, 10, 15, 20]) {
    ctx.beginPath(); ctx.moveTo(padL, py(yi)); ctx.lineTo(padL + W, py(yi)); ctx.stroke();
  }

  // 坐标轴
  ctx.strokeStyle = '#495057'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(padL, padT + H); ctx.lineTo(padL + W + 10, padT + H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(padL, padT + H); ctx.lineTo(padL, padT - 8); ctx.stroke();

  // 刻度标签
  ctx.fillStyle = '#495057'; ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  for (const xi of [0, 20, 40, 60, 80, 100]) ctx.fillText(String(xi), px(xi), padT + H + 15);
  ctx.textAlign = 'right';
  for (const yi of [5, 10, 15, 20]) ctx.fillText(String(yi), padL - 5, py(yi) + 4);

  // 轴标签
  ctx.textAlign = 'center'; ctx.fillStyle = C_DARK; ctx.font = '12px sans-serif';
  ctx.fillText('路程 (km)', padL + W / 2, padT + H + 32);
  ctx.save();
  ctx.translate(12, padT + H / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('耗电量 (kWh)', 0, 0);
  ctx.restore();
}

function drawLine(
  ctx: CanvasRenderingContext2D,
  k: number, b: number,
  utils: ReturnType<typeof makePlotUtils>,
  color: string, dashed = false, width = 2
) {
  const { px, py } = utils;
  ctx.strokeStyle = color; ctx.lineWidth = width;
  if (dashed) ctx.setLineDash([6, 3]); else ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(px(0), py(b)); ctx.lineTo(px(110), py(k * 110 + b)); ctx.stroke();
  ctx.setLineDash([]);
}

function drawErrorLines(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][], k: number, b: number,
  utils: ReturnType<typeof makePlotUtils>
) {
  const { px, py } = utils;
  ctx.strokeStyle = C_ORANGE; ctx.lineWidth = 1.5; ctx.setLineDash([4, 2]);
  for (const [x, y] of pts) {
    ctx.beginPath(); ctx.moveTo(px(x), py(y)); ctx.lineTo(px(x), py(k * x + b)); ctx.stroke();
  }
  ctx.setLineDash([]);
}

function drawPoints(
  ctx: CanvasRenderingContext2D,
  pts: [number, number][],
  utils: ReturnType<typeof makePlotUtils>,
  colorFn?: (p: [number, number]) => string
) {
  const { px, py } = utils;
  for (const p of pts) {
    const fill = colorFn ? colorFn(p) : C_GREEN;
    const stroke = fill === C_GREEN ? '#0F6E56' : '#993C1D';
    ctx.beginPath(); ctx.arc(px(p[0]), py(p[1]), 6, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke();
  }
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 0：封面
// ══════════════════════════════════════════════════════════════
function Slide封面() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100%',
      background: 'linear-gradient(140deg, #042C53 0%, #185FA5 55%, #378ADD 100%)',
      color: 'white',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.09)',
        border: '1px solid rgba(255,255,255,0.18)',
        borderRadius: 20, padding: '3rem 5rem', textAlign: 'center', maxWidth: 640,
      }}>
        <div style={{ fontSize: '3.5rem', marginBottom: 12 }}>📈</div>
        <h1 style={{ fontSize: '3rem', fontWeight: 'bold', margin: 0, letterSpacing: '-0.5px' }}>线性回归</h1>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 'normal', color: '#85B7EB', margin: '10px 0 28px' }}>
          机器学习基础模型
        </h2>
        <div style={{
          borderTop: '1px solid rgba(255,255,255,0.2)',
          paddingTop: 20, color: '#adb5bd', fontSize: '0.95rem', lineHeight: 1.8,
        }}>
          <div>中学信息科技</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>约 40 分钟 · 共 11 页</div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 1：目录
// ══════════════════════════════════════════════════════════════
function Slide目录() {
  const leftItems = [
    { n: '1', label: '引入', sub: '电动汽车耗电量问题' },
    { n: '2', label: '线性回归模型', sub: '最优直线 · 误差 · 损失函数' },
    { n: '3', label: '最小二乘法推导', sub: '（选学）偏导数求极值' },
  ];
  const rightItems = [
    { n: '4', label: '动手体验！', sub: '交互式回归实验台' },
    { n: '5', label: '思考与讨论', sub: '异常点 · 模型假设的边界' },
  ];
  return (
    <div style={{ padding: '1.5rem 2.5rem', minHeight: '100%' }}>
      <SlideHeader title="今天我们学什么？" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {leftItems.map(it => (
            <div key={it.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Circle n={it.n} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{it.label}</div>
                <div style={{ color: C_MUTED, fontSize: '0.88rem', marginTop: 2 }}>{it.sub}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {rightItems.map(it => (
            <div key={it.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <Circle n={it.n} color={C_ORANGE} />
              <div>
                <div style={{ fontWeight: 'bold', fontSize: '1.05rem' }}>{it.label}</div>
                <div style={{ color: C_MUTED, fontSize: '0.88rem', marginTop: 2 }}>{it.sub}</div>
              </div>
            </div>
          ))}
          <InfoBox title="📌 核心目标">
            理解线性回归的思想，<br />
            亲手用最小二乘法找到最优直线！
          </InfoBox>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 2：引入 — 电动汽车问题（动画散点）
// ══════════════════════════════════════════════════════════════
function Slide引入() {
  const [visCount, setVisCount] = useState(0);
  const [started, setStarted] = useState(false);
  const { wrapRef, dims } = useCanvasDims(48, 20, 20, 42);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!started) return;
    if (visCount >= EV_DATA.length) return;
    const t = setTimeout(() => setVisCount(n => n + 1), 280);
    return () => clearTimeout(t);
  }, [started, visCount]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || dims.cw < 20) return;
    const utils = makePlotUtils(dims);
    const ctx = getCtx(c, dims.cw, dims.ch);
    drawScatterBase(ctx, dims, utils);
    ctx.strokeStyle = C_ORANGE; ctx.lineWidth = 1.2; ctx.setLineDash([5, 3]);
    ctx.beginPath(); ctx.moveTo(utils.px(90), dims.padT); ctx.lineTo(utils.px(90), dims.padT + utils.H); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C_ORANGE; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('x = 90?', utils.px(90), dims.padT - 5);
    drawPoints(ctx, EV_DATA.slice(0, visCount), utils);
  }, [visCount, dims]);

  return (
    <div style={{ padding: '1.5rem 2.5rem', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <SlideHeader title="引入 — 一个真实的问题" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.6fr', gap: 24, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <InfoBox title="🚗 场景">
            自动驾驶电动汽车的<strong>耗电量</strong>与<strong>行驶路程</strong>之间存在关联——路程越长，耗电越高。
            <br /><br />
            但并不是严格的倍数关系：同样行驶 60 km，不同路况、坡度下耗电量会有差异。
          </InfoBox>
          <p style={{ lineHeight: 1.75, margin: '12px 0', color: C_DARK }}>
            <strong>我们的问题：</strong><br />
            绿色的点是真实环境下采样得到，
            能否通过这些点来<strong>预测</strong>电动汽车行驶至{' '}
            <span style={{ color: C_ORANGE, fontWeight: 'bold' }}>90 km</span>{' '}处时的耗电量？
          </p>
          {!started ? (
            <button onClick={() => setStarted(true)} style={{
              padding: '8px 22px', background: C_GREEN, color: 'white',
              border: 'none', borderRadius: 7, cursor: 'pointer',
              fontSize: '0.95rem', fontWeight: 'bold',
            }}>▶ 逐一显示数据点</button>
          ) : visCount < EV_DATA.length ? (
            <div style={{ color: C_MUTED, fontSize: '0.9rem' }}>
              已显示 {visCount} / {EV_DATA.length} 个点…
            </div>
          ) : (
            <InfoBox type="warn">
              💭 凭直觉估计一下：x=90 时，耗电量大约是多少 kWh？
            </InfoBox>
          )}
        </div>
        <div ref={wrapRef} style={{ minHeight: 0 }}>
          <canvas ref={canvasRef}
            style={{ display: 'block', width: '100%', height: '100%', borderRadius: 8, background: 'white', border: '1px solid #eee' }} />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 3：线性关系假设
// ══════════════════════════════════════════════════════════════
function Slide线性假设() {
  return (
    <div style={{ padding: '1.5rem 2.5rem', minHeight: '100%' }}>
      <SlideHeader title="线性关系的假设" />
      <InfoBox title="我们假设：">
        <p style={{ margin: '0 0 8px' }}>
          路程与耗电量可以用一次函数加上不可预测的随机噪声 <K tex="\varepsilon" /> 来描述：
        </p>
        <FormulaBox>
          <K tex="f(x) = kx + b + \varepsilon" display />
        </FormulaBox>
        <p style={{ margin: '8px 0 0', color: '#555', fontSize: '0.9em' }}>
          这样的自变量与因变量关系称为<strong>线性关系</strong>。
        </p>
      </InfoBox>
      <p style={{ margin: '14px 0', lineHeight: 1.8 }}>
        我们需要让机器通过学习，总结出预测最为准确的一组参数 <K tex="(k,\, b)" />。
        以得出<strong>最优线性关系</strong>为目标的机器学习问题称为<strong>线性回归问题</strong>。
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 8 }}>
        {[
          { label: '数据', desc: '所有已知点 (x, y)', bg: '#e8f4f8', border: '#85B7EB' },
          { label: '模型', desc: '某个满足需求的一次函数 f(x) = kx + b', bg: '#e8f5e9', border: '#a5d6a7' },
          { label: '输出', desc: '代入 x = 90 后得到预测耗电量', bg: '#fff3e0', border: '#ffcc80' },
        ].map(c => (
          <div key={c.label} style={{
            background: c.bg, border: `0.5px solid ${c.border}`,
            borderRadius: 8, padding: '14px', textAlign: 'center',
          }}>
            <div style={{ fontWeight: 'bold', fontSize: '1.15rem', marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: '0.88rem', color: '#555' }}>{c.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 4：什么叫"最优"？ — 核心交互幻灯片
//  拖动滑块调整直线，实时计算 SSE 并显示误差线
// ══════════════════════════════════════════════════════════════
function Slide最优交互() {
  const { wrapRef, dims } = useCanvasDims(50, 24, 20, 42);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { k: optK, b: optB, sse: optSSE } = leastSquares(EV_DATA);

  const [lineK, setLineK] = useState(0.08);
  const [lineB, setLineB] = useState(7.5);
  const [showErrors, setShowErrors] = useState(true);
  const [showOptimal, setShowOptimal] = useState(false);

  const sse = computeSSE(EV_DATA, lineK, lineB);
  const ratio = sse / optSSE;
  const isGood = ratio <= 1.5;
  const isOptimal = ratio <= 1.02;

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || dims.cw < 20) return;
    const utils = makePlotUtils(dims);
    const ctx = getCtx(c, dims.cw, dims.ch);
    drawScatterBase(ctx, dims, utils);
    if (showErrors) drawErrorLines(ctx, EV_DATA, lineK, lineB, utils);
    drawLine(ctx, lineK, lineB, utils, '#888888', true, 2.5);
    if (showOptimal) drawLine(ctx, optK, optB, utils, C_BLUE, false, 2.5);
    drawPoints(ctx, EV_DATA, utils);
  }, [lineK, lineB, showErrors, showOptimal, dims]);

  return (
    <div style={{ padding: '1.5rem 2.5rem', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <SlideHeader title={<>什么叫"最优"直线？</>} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr', gap: 22, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        {/* 左列：文字 + 控件 */}
        <div style={{ display: 'flex', flexDirection: 'column', overflow: 'auto' }}>
          <p style={{ lineHeight: 1.75, margin: '0 0 10px', color: C_DARK }}>
            平面上存在<strong>无数条</strong>直线，没有任何一条能经过所有数据点。
            对每个点定义误差 <K tex="e_i" />：
          </p>
          <FormulaBox>
            <K tex="e_i = y_i - f(x_i) = y_i - (kx_i + b)" display />
          </FormulaBox>
          <p style={{ lineHeight: 1.75, margin: '10px 0', color: C_DARK }}>
            将<strong>所有数据点误差的平方</strong>加起来，作为衡量直线好坏的标准。
          </p>

          {/* SSE 实时面板 */}
          <div style={{
            background: isOptimal ? '#e8f5e9' : isGood ? '#fff8e8' : '#fdecea',
            border: `1px solid ${isOptimal ? C_GREEN : isGood ? C_ORANGE : '#D32F2F'}`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 14,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>你的 SSE</span>
              <span style={{ fontSize: '1.6rem', fontWeight: 'bold', color: isOptimal ? C_GREEN : isGood ? C_ORANGE : '#D32F2F', fontFamily: 'monospace' }}>
                {sse.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#666', marginTop: 3 }}>
              <span>最优 SSE（最小二乘）</span>
              <span style={{ color: C_BLUE, fontWeight: 'bold' }}>{optSSE.toFixed(2)}</span>
            </div>
            <div style={{
              marginTop: 7, fontSize: '0.88rem', fontWeight: 'bold',
              color: isOptimal ? C_GREEN : isGood ? C_ORANGE : '#D32F2F',
            }}>
              {isOptimal
                ? '🎉 已达到最优！（相差不足 2%）'
                : `📉 当前是最优的 ${ratio.toFixed(2)} 倍${isGood ? '，已经不错！' : '，继续调整'}`}
            </div>
          </div>

          {/* 滑块 */}
          <div style={{ marginBottom: 12 }}>
            {[
              { label: '斜率 k', val: lineK, min: -0.1, max: 0.4, step: 0.001, set: setLineK },
              { label: '截距 b', val: lineB, min: -5, max: 15, step: 0.05, set: setLineB },
            ].map(sl => (
              <label key={sl.label} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
                <span style={{ width: 100, fontSize: '0.9rem', color: '#444', flexShrink: 0 }}>
                  {sl.label} = <strong>{sl.val.toFixed(3)}</strong>
                </span>
                <input type="range" min={sl.min} max={sl.max} step={sl.step}
                  value={sl.val} onChange={e => sl.set(Number(e.target.value))}
                  style={{ flex: 1 }} />
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setShowOptimal(s => !s)} style={{
              padding: '5px 14px', borderRadius: 5, cursor: 'pointer', fontSize: '0.88rem',
              background: showOptimal ? C_BLUE : 'white',
              color: showOptimal ? 'white' : C_BLUE, border: `1px solid ${C_BLUE}`,
            }}>{showOptimal ? '隐藏最优线' : '揭示最优线'}</button>
            <button onClick={() => { setLineK(optK); setLineB(optB); }} style={{
              padding: '5px 14px', borderRadius: 5, cursor: 'pointer', fontSize: '0.88rem',
              background: '#f0f0f0', border: '1px solid #ccc',
            }}>同步到最优值</button>
          </div>
        </div>

        {/* 右列：Canvas */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={wrapRef} style={{ flex: 1, minHeight: 0 }}>
            <canvas ref={canvasRef}
              style={{ display: 'block', width: '100%', height: '100%', borderRadius: 8, background: 'white', border: '1px solid #eee' }} />
          </div>
          <div style={{ marginTop: 6, fontSize: '0.8rem', color: '#888', display: 'flex', gap: 14, justifyContent: 'center', flexShrink: 0 }}>
            <span>
              <span style={{ display: 'inline-block', width: 20, height: 2, background: '#888', verticalAlign: 'middle', marginRight: 4, borderTop: '2px dashed #888' }} />
              你的直线
            </span>
            {showOptimal && (
              <span>
                <span style={{ display: 'inline-block', width: 20, height: 2, background: C_BLUE, verticalAlign: 'middle', marginRight: 4 }} />
                最优直线
              </span>
            )}
            {showErrors && (
              <span>
                <span style={{ display: 'inline-block', width: 20, height: 2, background: C_ORANGE, verticalAlign: 'middle', marginRight: 4, borderTop: '2px dashed ' + C_ORANGE }} />
                误差
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 5：损失函数 + 为什么要平方
// ══════════════════════════════════════════════════════════════
function Slide损失函数() {
  return (
    <div style={{ padding: '1.5rem 2.5rem', minHeight: '100%' }}>
      <SlideHeader title="损失函数 — 误差平方和 (SSE)" />
      <InfoBox title="❓ 为什么要平方？" type="warn">
        <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 2.1 }}>
          <li>误差可正可负，直接相加会相互抵消，平方后<strong>所有误差都为非负数</strong></li>
          <li>平方会<strong>放大大误差</strong>，让优化对离群点更敏感</li>
          <li>平方函数很平滑（处处可导），便于后续数学推导</li>
        </ul>
      </InfoBox>
      <InfoBox title="🎯 损失函数 — 误差平方和 (SSE)">
        <FormulaBox>
          <K tex="\text{SSE} = \sum_i e_i^2 = \sum_i \left(y_i - (kx_i + b)\right)^2" display />
        </FormulaBox>
        <div style={{ textAlign: 'center', fontWeight: 'bold', marginTop: 6, color: C_BLUE }}>
          最优直线 &nbsp;⟹&nbsp; 使 SSE 最小的那条直线
        </div>
      </InfoBox>
      <p style={{ marginTop: 14, lineHeight: 1.8, color: C_DARK }}>
        <strong>损失</strong>：当前模型效果与"最优"效果的差距。<br />
        <strong>损失函数</strong>：模型参数（此处为 <K tex="k" /> 和 <K tex="b" />）与损失之间的对应关系。
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 6：如何找到最优直线？（逐步揭示）
// ══════════════════════════════════════════════════════════════
function Slide求解方法() {
  const [revealed, setRevealed] = useState(0);
  const methods = [
    {
      label: '随机搜索',
      desc: '尝试每个可能的 k 和 b，枚举并比较 SSE，效率极低，几乎不可行。',
      color: '#888',
    },
    {
      label: '最小二乘法',
      desc: '通过数学推导，对损失函数求偏导数，直接解出使 SSE 最小的 k 和 b 精确公式。快速且准确。',
      color: C_BLUE,
    },
    {
      label: '梯度下降法',
      desc: '取一对随机的 k 和 b，计算损失函数在当前位置的梯度，令参数朝梯度反方向移动一小步，反复迭代直到损失不再下降。是深度学习的核心优化方法。',
      color: C_GREEN,
    },
  ];
  return (
    <div style={{ padding: '1.5rem 2.5rem', minHeight: '100%' }}>
      <SlideHeader title="如何找到最优直线？" />
      <InfoBox>
        <K tex="\text{SSE} = \sum_i (y_i - (kx_i + b))^2" display />
      </InfoBox>
      <p style={{ margin: '12px 0', color: C_DARK }}>使损失（SSE）最小，有三条路：</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {methods.map((m, i) => {
          const isRevealed = i < revealed;
          return (
            <div
              key={i}
              onClick={() => { if (!isRevealed) setRevealed(i + 1); }}
              style={{
                display: 'flex', gap: 16, alignItems: 'flex-start',
                padding: '14px 18px', borderRadius: 8,
                border: `1.5px solid ${isRevealed ? m.color : '#ddd'}`,
                background: isRevealed ? m.color + '10' : '#f8f8f8',
                cursor: isRevealed ? 'default' : 'pointer',
                transition: 'all 0.25s',
                opacity: i > revealed ? 0.45 : 1,
              }}>
              <Circle n={i + 1} color={isRevealed ? m.color : '#bbb'} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', color: isRevealed ? m.color : '#aaa', marginBottom: 4, fontSize: '1.05rem' }}>
                  {isRevealed ? m.label : `方法 ${i + 1}（点击揭示）`}
                </div>
                {isRevealed && <div style={{ color: '#444', lineHeight: 1.65, fontSize: '0.95rem' }}>{m.desc}</div>}
              </div>
            </div>
          );
        })}
      </div>
      {revealed === 0 && (
        <p style={{ color: '#bbb', fontSize: '0.85rem', textAlign: 'center', marginTop: 10 }}>
          👆 点击方法卡片逐步揭示
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 7：最小二乘法推导（选学）
// ══════════════════════════════════════════════════════════════
function Slide推导() {
  return (
    <div style={{ padding: '1.5rem 2.5rem', minHeight: '100%' }}>
      <SlideHeader title={<>最小二乘法推导 <Badge text="选学" color={C_ORANGE} /></>} />
      <p style={{ lineHeight: 1.75, marginBottom: 12, color: C_DARK }}>
        一元线性回归的 SSE 本质上是关于 <K tex="k, b" /> 的<strong>二元二次函数</strong>。
        由 Hessian 判别法可知，当 <K tex="\Delta > 0" /> 且 <K tex="a > 0" /> 时，
        函数有唯一极小值点，同时因为是严格凸函数，该极小值即为全局最小值。
      </p>
      <p style={{ lineHeight: 1.75, marginBottom: 10, color: C_DARK }}>
        对 SSE 分别对 <K tex="k" />、<K tex="b" /> 求偏导并令其等于 0：
      </p>
      <FormulaBox>
        <K tex="\dfrac{\partial}{\partial k} \sum_i (y_i - kx_i - b)^2 = 0" display />
        <div style={{ marginTop: 10 }}>
          <K tex="\dfrac{\partial}{\partial b} \sum_i (y_i - kx_i - b)^2 = 0" display />
        </div>
      </FormulaBox>
      <p style={{ lineHeight: 1.75, margin: '14px 0 10px', color: C_DARK }}>
        联立求解，得到 <K tex="k" /> 和 <K tex="b" /> 的<strong>精确计算公式</strong>：
      </p>
      <FormulaBox>
        <K tex="k = \dfrac{N\sum x_i y_i - \sum x_i \cdot \sum y_i}{N\sum x_i^2 - \left(\sum x_i\right)^2}" display />
        <div style={{ marginTop: 12 }}>
          <K tex="b = \dfrac{\sum y_i - k\sum x_i}{N}" display />
        </div>
      </FormulaBox>
      <InfoBox><K tex="N" /> 为数据点总数</InfoBox>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 8：互动实验台（替代原 HTML 小程序）
//  · 自动模式：最小二乘法实时计算最优线
//  · 手动模式：k/b 滑块探索，实时反馈 SSE 比值
//  · 点击画布添加数据点
// ══════════════════════════════════════════════════════════════
function Slide互动实验() {
  const { wrapRef, dims } = useCanvasDims(48, 18, 16, 38);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [points, setPoints] = useState<[number, number][]>([...EV_DATA]);
  const [showErrors, setShowErrors] = useState(false);
  const [manualK, setManualK] = useState(0.14);
  const [manualB, setManualB] = useState(2.86);

  const { k: optK, b: optB, sse: optSSE } = leastSquares(points);
  const dispK = mode === 'auto' ? optK : manualK;
  const dispB = mode === 'auto' ? optB : manualB;
  const curSSE = computeSSE(points, dispK, dispB);
  const ratio = optSSE > 0 ? curSSE / optSSE : 1;
  const isOriginal = (p: [number, number]) => EV_DATA.some(d => d[0] === p[0] && d[1] === p[1]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const utils = makePlotUtils(dims);
    const p = (window as any).CourseGlobalContext?.canvas?.getCanvasPoint?.(e, e.currentTarget);
    if (!p) return;
    const [x, y] = utils.toData(p.x, p.y);
    if (x >= 5 && x <= 105 && y >= 0.5 && y <= 21.5) {
      setPoints(ps => [...ps, [x, y]]);
    }
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || dims.cw < 20) return;
    const utils = makePlotUtils(dims);
    const ctx = getCtx(c, dims.cw, dims.ch);
    drawScatterBase(ctx, dims, utils);
    if (showErrors) drawErrorLines(ctx, points, dispK, dispB, utils);
    drawLine(ctx, dispK, dispB, utils, C_BLUE, false, 2.5);
    drawPoints(ctx, points, utils, p => isOriginal(p) ? C_GREEN : C_ORANGE);
  }, [points, dispK, dispB, showErrors, mode, dims]);

  const sseColor = mode === 'auto' ? C_GREEN : ratio <= 1.5 ? C_ORANGE : '#D32F2F';
  const sseBg = mode === 'auto' ? '#e8f5e9' : ratio <= 1.5 ? '#fff3e0' : '#fdecea';

  return (
    <div style={{ padding: '1.2rem 2rem', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      <SlideHeader title="🧪 互动实验台" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 20, flex: 1, minHeight: 0, alignItems: 'stretch' }}>
        {/* 左：画布 */}
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexShrink: 0 }}>
            {(['auto', 'manual'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} style={{
                padding: '4px 14px', borderRadius: 5, cursor: 'pointer', fontSize: '0.87rem',
                background: mode === m ? C_BLUE : 'white',
                color: mode === m ? 'white' : C_BLUE, border: `1px solid ${C_BLUE}`,
              }}>
                {m === 'auto' ? '⚙ 最小二乘（自动）' : '✋ 手动探索'}
              </button>
            ))}
          </div>
          <div ref={wrapRef} style={{ flex: 1, minHeight: 0 }}>
            <canvas ref={canvasRef}
              onClick={handleClick}
              style={{
                display: 'block', width: '100%', height: '100%',
                borderRadius: 8, background: 'white',
                border: '1px solid #eee', cursor: 'crosshair',
              }} />
          </div>
          <div style={{ fontSize: '0.78rem', color: '#888', marginTop: 4, flexShrink: 0 }}>
            🖱 点击画布添加数据点
            <span style={{ marginLeft: 12 }}>
              <span style={{ color: C_GREEN }}>●</span> 原始数据
              <span style={{ color: C_ORANGE, marginLeft: 8 }}>●</span> 新增数据
            </span>
          </div>
        </div>

        {/* 右：统计 + 控件 + 任务卡 */}
        <div>
          {/* SSE 面板 */}
          <div style={{
            background: sseBg, border: `1px solid ${sseColor}`,
            borderRadius: 8, padding: '10px 14px', marginBottom: 12,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>当前 SSE</span>
              <span style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 'bold', color: sseColor }}>
                {curSSE.toFixed(2)}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem', color: '#666', marginTop: 2 }}>
              <span>最优 SSE</span>
              <span style={{ color: C_BLUE, fontWeight: 'bold' }}>{optSSE.toFixed(2)}</span>
            </div>
            {mode === 'manual' && (
              <div style={{ marginTop: 6, fontSize: '0.85rem', fontWeight: 'bold', color: sseColor }}>
                {ratio <= 1.02 ? '🎉 达到最优！' : `你的 SSE 是最优的 ${ratio.toFixed(2)} 倍`}
              </div>
            )}
          </div>

          {/* 自动模式：显示公式结果 */}
          {mode === 'auto' && (
            <div style={{
              background: '#f0f4ff', border: '1px solid #85B7EB',
              borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '0.9rem',
            }}>
              <div style={{ marginBottom: 4, color: '#555' }}>最小二乘法计算结果：</div>
              <div style={{ fontFamily: 'monospace', lineHeight: 1.9 }}>
                k = <strong>{optK.toFixed(4)}</strong><br />
                b = <strong>{optB.toFixed(4)}</strong>
              </div>
              <div style={{ marginTop: 6, fontSize: '0.85rem', color: '#555' }}>
                预测 x = 90：&nbsp;
                <strong style={{ color: C_BLUE, fontSize: '1rem' }}>
                  {(optK * 90 + optB).toFixed(2)} kWh
                </strong>
              </div>
            </div>
          )}

          {/* 手动模式：滑块 */}
          {mode === 'manual' && (
            <div style={{ marginBottom: 12 }}>
              {[
                { label: 'k', min: -0.1, max: 0.4, step: 0.001, val: manualK, set: setManualK },
                { label: 'b', min: -5, max: 15, step: 0.05, val: manualB, set: setManualB },
              ].map(sl => (
                <label key={sl.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 90, fontSize: '0.88rem', flexShrink: 0 }}>
                    {sl.label} = <strong>{sl.val.toFixed(sl.label === 'k' ? 3 : 2)}</strong>
                  </span>
                  <input type="range" min={sl.min} max={sl.max} step={sl.step}
                    value={sl.val} onChange={e => sl.set(Number(e.target.value))}
                    style={{ flex: 1 }} />
                </label>
              ))}
            </div>
          )}

          {/* 工具按钮 */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
            <button onClick={() => setShowErrors(s => !s)} style={{
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: '0.85rem',
              background: showErrors ? C_ORANGE : 'white',
              color: showErrors ? 'white' : C_ORANGE, border: `1px solid ${C_ORANGE}`,
            }}>{showErrors ? '隐藏误差线' : '显示误差线'}</button>
            <button onClick={() => setPoints([...EV_DATA])} style={{
              padding: '4px 12px', borderRadius: 5, cursor: 'pointer', fontSize: '0.85rem',
              background: '#f5f5f5', border: '1px solid #ccc',
            }}>重置数据</button>
          </div>

          {/* 任务卡 */}
          <div style={{
            background: '#f8f9fa', borderRadius: 8,
            padding: '10px 14px', fontSize: '0.86rem', lineHeight: 1.75,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>📋 探索任务</div>
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              <li>记录最优 k、b 和最优 SSE 的值</li>
              <li>切到「手动探索」，将 SSE 调到最优值的 <strong>1.5 倍以内</strong></li>
              <li>添加 3 个新数据点，观察回归直线如何变化</li>
              <li>加入一个极端点（如路程 50，耗电 20），观察变化</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 9：思考与讨论
// ══════════════════════════════════════════════════════════════
function Slide讨论() {
  const [showHint, setShowHint] = useState<boolean[]>([false, false]);
  const toggle = (i: number) => setShowHint(h => h.map((v, j) => j === i ? !v : v));

  const questions = [
    {
      q: '如果我们加入一个路程很短但耗电量异常高的数据点，回归直线会怎样变化？这说明了什么？',
      hint: '线性回归对异常点（Outlier）非常敏感。因为 SSE 会对异常误差平方放大，使得拟合结果被"拉偏"。这说明在实际应用中，数据清洗和异常值处理非常重要。可在前一页实验台中亲手验证！',
    },
    {
      q: '线性回归假设路程和耗电量的关系是线性的。现实中这个假设一定成立吗？如果不成立，会产生什么问题？',
      hint: '现实中，高速公路与市区的单位耗电量差异很大，短途启停频繁的关系也可能是非线性的。若用线性模型拟合非线性数据，会产生系统性偏差（欠拟合）。解决办法包括：多项式回归、特征工程、更复杂的非线性模型等。',
    },
  ];

  return (
    <div style={{ padding: '1.5rem 2.5rem', minHeight: '100%' }}>
      <SlideHeader title="思考与讨论 💬" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {questions.map((q, i) => (
          <div key={i} style={{
            background: '#e8f5e9', border: `1px solid ${C_GREEN}`,
            borderRadius: 8, padding: '16px',
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 8, color: C_DARK }}>问题 {i + 1}</div>
            <p style={{ margin: 0, lineHeight: 1.75, color: C_DARK }}>{q.q}</p>
            <button onClick={() => toggle(i)} style={{
              marginTop: 10, padding: '4px 14px', borderRadius: 5,
              background: 'transparent', border: `1px solid ${C_GREEN}`,
              color: C_GREEN, cursor: 'pointer', fontSize: '0.88rem',
            }}>
              {showHint[i] ? '收起提示' : '💡 查看提示'}
            </button>
            {showHint[i] && (
              <div style={{
                marginTop: 10, background: 'white', borderRadius: 6,
                padding: '10px 14px', fontSize: '0.9rem', lineHeight: 1.75, color: '#444',
              }}>{q.hint}</div>
            )}
          </div>
        ))}
        <InfoBox type="warn">
          线性回归是机器学习中<strong>最简单</strong>的模型，但它的核心思想——
          "用数据找规律，最小化损失"——贯穿了几乎所有复杂的机器学习算法。
        </InfoBox>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  幻灯片 10：本课小结
// ══════════════════════════════════════════════════════════════
function Slide小结() {
  const points = [
    { badge: '知识点 1', text: <><strong>线性回归</strong>分析自变量 x 与因变量 y 的线性关系，用 <K tex="f(x) = kx + b" /> 表示</>, badgeColor: C_BLUE },
    { badge: '知识点 2', text: <><strong>误差平方和（SSE）</strong>是衡量直线好坏的损失函数；最优直线使 SSE 最小</>, badgeColor: C_BLUE },
    { badge: '知识点 3', text: <><strong>最小二乘法</strong>通过偏导数求极值，可直接得出唯一最优 k 和 b 的解析公式</>, badgeColor: C_BLUE },
    { badge: '我们还', text: <><strong>亲手体验</strong>了交互式回归实验台，直观感受了最小二乘法求解最优直线的过程</>, badgeColor: C_ORANGE },
  ];
  return (
    <div style={{ padding: '1.5rem 2.5rem', minHeight: '100%' }}>
      <SlideHeader title="本课小结" />
      <p style={{ fontWeight: 'bold', marginBottom: 16 }}>今天我们学到了什么？</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 22 }}>
        {points.map((p, i) => (
          <div key={i} style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
            <Badge text={p.badge} color={p.badgeColor} />
            <div style={{ lineHeight: 1.75, paddingTop: 2 }}>{p.text}</div>
          </div>
        ))}
      </div>
      <InfoBox type="ok" title="📎 课后延伸">
        思考：如果自变量有两个（路程 + 坡度），还能用直线描述吗？<br />
        如果损失函数无法直接求出解析最小值，该怎么办？（提示：梯度下降）
      </InfoBox>
      <InfoBox type="warn">
        <strong>课后小测</strong>：完成本课随堂测验，巩固线性回归的核心概念。
      </InfoBox>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  CourseData 注册（SyncEngine 合约）
// ══════════════════════════════════════════════════════════════
(window as any).CourseData = {
  title: '线性回归',
  icon: '📈',
  desc: '机器学习基础模型 · 最小二乘法 · 含交互实验台',
  color: 'from-blue-600 to-indigo-700',
  dependencies: [
    {
      name: 'katex',
      localSrc: '/lib/katex.min.js',
      publicSrc: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
    },
  ],
  slides: [
    { id: 's0',  component: <Slide封面 /> },
    { id: 's1',  component: <Slide目录 /> },
    { id: 's2',  component: <Slide引入 /> },
    { id: 's3',  component: <Slide线性假设 /> },
    { id: 's4',  component: <Slide最优交互 /> },
    { id: 's5',  component: <Slide损失函数 /> },
    { id: 's6',  component: <Slide求解方法 /> },
    { id: 's7',  component: <Slide推导 /> },
    { id: 's8',  component: <Slide互动实验 /> },
    { id: 's9',  component: <Slide讨论 /> },
    { id: 's10', component: <Slide小结 /> },
  ],
};
