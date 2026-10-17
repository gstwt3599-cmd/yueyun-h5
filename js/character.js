/* ============================================================
 * 粤韵新声 · 角色出场动画引擎（Canvas 2D，零依赖）
 *
 * 设计思路：
 *   1. 用「姿态关键帧 + 属性补间」驱动，每个行当一套关键帧；
 *   2. 人物用几何图形拼装（长袍、水袖、把子、扇、髯口），
 *      换成真实美术素材时，只需替换 drawFigure 内部的绘制；
 *   3. 舞台层（追光、光尘、地台倒影）独立于人物层，可复用。
 * ============================================================ */

const SV = {
  gold: '#C9A227',
  goldSoft: '#E3C567',
  ink: '#0B0709',
  skin: '#F7E4CB',
  skinShade: '#E5C6A6',
  inkLine: '#2A1A16'
};

/* ---------- 各角色配色与配件 ---------- */
const FIGURE_THEME = {
  wenwusheng: {
    robe: '#8E2B2B', robeDark: '#631C1E', trim: '#E0BE55', sash: '#C9A227',
    hair: '#181113', hat: 'cap', hatColor: '#7A2224', hatTrim: '#E0BE55',
    face: 'jun', brow: 'bold', prop: 'blade', propColor: '#D9DEE3'
  },
  xiaosheng: {
    robe: '#2F6E6A', robeDark: '#21504D', trim: '#E5EAD9', sash: '#C9A227',
    hair: '#181113', hat: 'wenjin', hatColor: '#255C58', hatTrim: '#E5EAD9',
    face: 'jun', brow: 'thin', prop: 'fan'
  },
  huadan: {
    robe: '#C8385A', robeDark: '#96294180', trim: '#F8DCE4', sash: '#E3C567',
    hair: '#161013', hat: 'crown', hatColor: '#C8385A', hatTrim: '#E3C567',
    face: 'dan', brow: 'willow', prop: 'sleeve'
  },
  erbang: {
    robe: '#6B3FA0', robeDark: '#4B2A75', trim: '#F0D9A8', sash: '#C8385A',
    hair: '#161013', hat: 'crown', hatColor: '#6B3FA0', hatTrim: '#F0D9A8',
    face: 'dan', brow: 'willow', prop: 'sword', propColor: '#E2E6EA'
  },
  chousheng: {
    robe: '#B8892B', robeDark: '#8A6318', trim: '#7A8C3A', sash: '#7A8C3A',
    hair: '#181113', hat: 'bun', hatColor: '#8A6318', hatTrim: '#7A8C3A',
    face: 'chou', brow: 'comic', prop: 'fan', fanColor: '#F2E3C4'
  },
  wusheng: {
    robe: '#2E4A73', robeDark: '#1E3454', trim: '#E8D9B5', sash: '#B8352F',
    hair: '#181113', hat: 'helmet', hatColor: '#22395C', hatTrim: '#C9A227',
    face: 'laosheng', brow: 'bold', prop: 'beard', beard: '#2B2724'
  }
};

/* 骨架尺寸（改这里就能整体调比例；必须在 T() 与 CHOREO 之前声明） */
const ARM_UPPER = 46;   /* 上臂长 */
const ARM_FORE = 40;    /* 前臂长 */
const SHOULDER = { x: 26, y: -78 };  /* 单侧肩点（x 取绝对值） */

/** 两段式手臂反解：给定目标手腕位置，返回 { ca, ha }（角度制）
 *  约定：右臂（画面右侧）ca ∈ (-90°, 90°)，左臂 ca ∈ (90°, 270°)，
 *       即左右两侧的 ca 都与各自肩到手的连线方向一致。 */
function ikReach(S, tx, ty) {
  let bx = tx - S.x, by = ty - S.y;
  const d0 = Math.hypot(bx, by);
  const lo = Math.abs(ARM_UPPER - ARM_FORE) + 1.5;   /* 太近会「折死」 */
  const hi = ARM_UPPER + ARM_FORE - 2.5;             /* 太远会「打直」 */
  let d = Math.max(lo, Math.min(hi, d0));
  if (d0 > 0.001) { bx = bx * d / d0; by = by * d / d0; }
  const phi = Math.atan2(by, bx);
  const cosA = (ARM_UPPER * ARM_UPPER + d * d - ARM_FORE * ARM_FORE) / (2 * ARM_UPPER * d);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const ca = phi + A * S.sWith;                       /* 手肘朝身侧张开 */
  const hx0 = S.x + ARM_UPPER * Math.cos(ca);
  const hy0 = S.y + ARM_UPPER * Math.sin(ca);
  const ha = Math.atan2(S.y + by - hy0, S.x + bx - hx0) - ca;
  const hand = { x: S.x + bx, y: S.y + by };
  return {
    ca: ca * 180 / Math.PI,
    ha: ha * 180 / Math.PI,
    hx: hand.x,
    hy: hand.y
  };
}

/** 生成一个手位（可直接放进关键帧的 h 数组）
 *  haAdd 是「手法」的额外偏转，会让手位略微偏离目标，
 *  因此这里迭代几次把 ca 收回，让手腕最终落在目标点上。 */
function T(side, tx, ty, haAdd) {
  const S = { x: side * SHOULDER.x, y: SHOULDER.y, sWith: side > 0 ? -1 : 1 };
  let ca = 0, ha = 0, hx = tx, hy = ty;
  for (let i = 0; i < 6; i++) {
    const r = ikReach(S, tx, ty);
    ha = r.ha + (haAdd || 0);
    /* 用修正后的 ha 重算腕部实际落点 */
    const caR = r.ca * Math.PI / 180;
    const ex = S.x + ARM_UPPER * Math.cos(caR);
    const ey = S.y + ARM_UPPER * Math.sin(caR);
    const fx = caR + ha * Math.PI / 180;
    hx = ex + ARM_FORE * Math.cos(fx);
    hy = ey + ARM_FORE * Math.sin(fx);
    ca = r.ca;
    /* 把误差回代到目标点，下一轮收敛 */
    const ex2 = tx - hx, ey2 = ty - hy;
    if (Math.hypot(ex2, ey2) < 0.4) break;
    tx += ex2 * 0.9;
    ty += ey2 * 0.9;
  }
  return { x: hx, y: hy, ca: ca, ha: ha };
}

/* ---------- 出场编排（时间单位：秒）----------
 * 姿态约定（人物中心为原点，y 向下为正）：
 *   头心 y = -118，肩线 y = -78，腰带 y = -6，下摆 y = 128
 *   手位 y：90 下垂 / 74 胯侧 / 58 腰际 / 42 胸口 / 24 举起
 *   手位用 T(side, x, y, 手法偏转) 生成，不用手算角度
 * -------------------------------------------- */
function P(o) {
  const d = {
    t: 0, vis: 0, tx: 0, rot: 0, hb: 0, lean: 0,
    h: [T(-1, -26, 78, 6), T(1, 26, 78, -6)],
    sx: 52, sy: 50, pr: 0, glow: 0.15, ripple: 0
  };
  if (o) {
    if (o.h) d.h = o.h;
    Object.keys(o).forEach(function (k) { if (k !== 'h') d[k] = o[k]; });
  }
  return d;
}

const CHOREO = {
  /* 文武生：入场亮相 → 端袖 → 拔剑侧扫 → 收剑定势 */
  wenwusheng: [
    P({ t: 0.00, vis: 0, tx: -34, glow: 0.12 }),
    P({ t: 0.75, vis: 1, tx: 0, glow: 0.5, ripple: 1, sx: 46, sy: 46,
        h: [T(-1, -24, 84, 8), T(1, 24, 84, -8)] }),
    P({ t: 1.30, vis: 1, glow: 0.62, pr: 0.2, sx: 52, sy: 50,
        h: [T(-1, -34, 64, 12), T(1, 34, 64, -12)] }),
    P({ t: 1.90, vis: 1, glow: 0.76, rot: -6, hb: -3, pr: 0.7, sx: 58, sy: 54,
        h: [T(-1, -50, 48, 16), T(1, 46, 60, -10)] }),
    P({ t: 2.40, vis: 1, glow: 0.84, rot: 10, lean: 3, hb: 3, pr: 1, ripple: 1, sx: 58, sy: 54,
        h: [T(-1, -26, 70, 10), T(1, 56, 46, -18)] }),
    P({ t: 2.95, vis: 1, glow: 0.72, rot: 3, pr: 1, sx: 54, sy: 50,
        h: [T(-1, -24, 74, 8), T(1, 52, 52, -14)] }),
    P({ t: 3.80, vis: 1, glow: 0.66, rot: 1, pr: 1, sx: 50, sy: 46,
        h: [T(-1, -26, 62, 6), T(1, 40, 58, -10)] })
  ],

  /* 小生：入场 → 展扇 → 举扇侧望 → 掩袖 */
  xiaosheng: [
    P({ t: 0.00, vis: 0, tx: -26, rot: -4, glow: 0.12 }),
    P({ t: 0.70, vis: 1, tx: 0, rot: 0, glow: 0.5, ripple: 1, sx: 46, sy: 46,
        h: [T(-1, -22, 86, 6), T(1, 22, 86, -6)] }),
    P({ t: 1.25, vis: 1, glow: 0.62, pr: 0.3, sx: 50, sy: 48,
        h: [T(-1, -32, 66, 10), T(1, 32, 66, -10)] }),
    P({ t: 1.85, vis: 1, glow: 0.78, rot: -10, hb: -3, pr: 1, sx: 56, sy: 54,
        h: [T(-1, -46, 52, 14), T(1, 42, 44, -16)] }),
    P({ t: 2.70, vis: 1, glow: 0.8, rot: 9, hb: 2, pr: 1, sx: 54, sy: 50,
        h: [T(-1, -28, 68, 10), T(1, 46, 48, -14)] }),
    P({ t: 3.60, vis: 1, glow: 0.68, rot: 2, pr: 0.88, sx: 50, sy: 46,
        h: [T(-1, -26, 64, 6), T(1, 34, 62, -8)] })
  ],

  /* 正印花旦：入场 → 起袖 → 抛袖亮相 → 含袖回身 */
  huadan: [
    P({ t: 0.00, vis: 0, tx: -22, rot: -3, glow: 0.12, sx: 44, sy: 44 }),
    P({ t: 0.70, vis: 1, tx: 0, rot: 0, glow: 0.5, ripple: 1, sx: 48, sy: 46,
        h: [T(-1, -20, 86, 6), T(1, 20, 86, -6)] }),
    P({ t: 1.25, vis: 1, glow: 0.62, sx: 52, sy: 48, hb: -2,
        h: [T(-1, -30, 68, 10), T(1, 30, 68, -10)] }),
    P({ t: 1.85, vis: 1, glow: 0.82, rot: -7, sx: 58, sy: 54, hb: -4,
        h: [T(-1, -52, 52, 18), T(1, 52, 52, -18)] }),
    P({ t: 2.45, vis: 1, glow: 0.9, rot: 14, sx: 60, sy: 56, hb: 2, ripple: 1,
        h: [T(-1, -62, 42, 22), T(1, 62, 42, -22)] }),
    P({ t: 3.05, vis: 1, glow: 0.84, rot: 4, sx: 56, sy: 52, hb: 0,
        h: [T(-1, -50, 58, 16), T(1, 50, 58, -16)] }),
    P({ t: 3.75, vis: 1, glow: 0.74, rot: 2, sx: 52, sy: 48,
        h: [T(-1, -30, 62, 10), T(1, 30, 62, -10)] })
  ],

  /* 二帮花旦：入场 → 横刀 → 转身挥刀 → 回眸收势 */
  erbang: [
    P({ t: 0.00, vis: 0, tx: -30, rot: -6, glow: 0.12, sx: 46, sy: 44 }),
    P({ t: 0.70, vis: 1, tx: 0, rot: 0, glow: 0.5, ripple: 1, sx: 48, sy: 46,
        h: [T(-1, -22, 84, 8), T(1, 22, 84, -8)] }),
    P({ t: 1.25, vis: 1, glow: 0.64, rot: -6, sx: 52, sy: 48, pr: 0.35,
        h: [T(-1, -34, 64, 12), T(1, 34, 62, -14)] }),
    P({ t: 1.85, vis: 1, glow: 0.8, rot: -20, lean: -4, sx: 56, sy: 52, pr: 0.75, hb: -3,
        h: [T(-1, -48, 50, 16), T(1, 48, 58, -12)] }),
    P({ t: 2.35, vis: 1, glow: 0.9, rot: 18, lean: 5, sx: 58, sy: 54, pr: 1, ripple: 1, hb: 4,
        h: [T(-1, -28, 70, 12), T(1, 58, 48, -20)] }),
    P({ t: 3.00, vis: 1, glow: 0.82, rot: 6, pr: 1, sx: 54, sy: 50,
        h: [T(-1, -24, 76, 8), T(1, 54, 54, -16)] }),
    P({ t: 3.80, vis: 1, glow: 0.72, rot: 3, pr: 1, sx: 50, sy: 46,
        h: [T(-1, -26, 62, 6), T(1, 42, 56, -12)] })
  ],

  /* 丑生：碎步入场 → 开扇 → 扇敲鼻（抖包袱）→ 耸肩亮相 */
  chousheng: [
    P({ t: 0.00, vis: 0, tx: -30, glow: 0.12 }),
    P({ t: 0.65, vis: 1, tx: 0, glow: 0.5, ripple: 1, sx: 48, sy: 46,
        h: [T(-1, -22, 84, 8), T(1, 22, 84, -8)] }),
    P({ t: 1.00, vis: 1, tx: 7, rot: 4, glow: 0.58, hb: -3, sx: 52, sy: 48,
        h: [T(-1, -32, 66, 12), T(1, 32, 66, -12)] }),
    P({ t: 1.28, vis: 1, tx: -7, rot: -4, glow: 0.6, hb: 3, sx: 52, sy: 48,
        h: [T(-1, -30, 68, 10), T(1, 30, 68, -10)] }),
    P({ t: 1.65, vis: 1, glow: 0.68, pr: 0.6, sx: 54, sy: 50,
        h: [T(-1, -26, 76, 8), T(1, 40, 54, -14)] }),
    P({ t: 2.00, vis: 1, glow: 0.8, rot: -5, hb: -6, pr: 0.8, sx: 56, sy: 52,
        h: [T(-1, -30, 72, 10), T(1, 10, 20, -6)] }),
    P({ t: 2.40, vis: 1, glow: 0.84, rot: 4, hb: 4, pr: 0.9, sx: 54, sy: 50,
        h: [T(-1, -28, 74, 8), T(1, 14, 28, -8)] }),
    P({ t: 3.10, vis: 1, glow: 0.72, rot: 0, pr: 0.9, sx: 50, sy: 46,
        h: [T(-1, -26, 64, 6), T(1, 34, 58, -10)] })
  ],

  /* 武生：沉步登场 → 端袖 → 捋须 → 拱手定势 */
  wusheng: [
    P({ t: 0.00, vis: 0, tx: -24, glow: 0.12, sx: 50, sy: 48 }),
    P({ t: 0.85, vis: 1, tx: 0, glow: 0.5, ripple: 1, sx: 52, sy: 50,
        h: [T(-1, -24, 86, 6), T(1, 24, 86, -6)] }),
    P({ t: 1.40, vis: 1, glow: 0.6, lean: -2, hb: -2, sx: 54, sy: 52,
        h: [T(-1, -28, 70, 10), T(1, 28, 70, -10)] }),
    P({ t: 2.00, vis: 1, glow: 0.76, rot: -3, hb: -4, pr: 0.8, sx: 56, sy: 54,
        h: [T(-1, -22, 56, 12), T(1, 22, 58, -12)] }),
    P({ t: 2.50, vis: 1, glow: 0.82, rot: -2, hb: -5, pr: 1, sx: 56, sy: 54,
        h: [T(-1, -18, 52, 14), T(1, 20, 60, -12)] }),
    P({ t: 3.10, vis: 1, glow: 0.72, rot: 0, hb: 1, pr: 0.5, sx: 54, sy: 50,
        h: [T(-1, -34, 62, 12), T(1, 34, 62, -12)] })
  ]
};

/* ---------- 几何小工具 ---------- */
function rotPt(x, y, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}
/** 由肩点 + { ca, ha } 求出肘、腕位置（角度制）
 *  注意：这里的腕部位置必须与 T() 的迭代结果一致，
 *  否则手臂笔触的终点与袖子的起点会错开，出现断层。 */
function armJoints(sh, p) {
  const ca = p.ca * Math.PI / 180;
  const ha = p.ha * Math.PI / 180;
  const ex = sh.x + Math.cos(ca) * ARM_UPPER;
  const ey = sh.y + Math.sin(ca) * ARM_UPPER;
  const fx = ca + ha;
  const hx = ex + Math.cos(fx) * ARM_FORE;
  const hy = ey + Math.sin(fx) * ARM_FORE;
  return { sh: sh, ex: ex, ey: ey, hx: hx, hy: hy };
}

/** 两个十六进制色按比例混合（p=0 取 a，p=1 取 b），用于水袖的渐变 */
function svMix(a, b, p) {
  function hex2rgb(h) {
    h = (h || '#000000').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const A = hex2rgb(a), B = hex2rgb(b);
  const c = [0, 1, 2].map(function (i) { return Math.round(A[i] + (B[i] - A[i]) * p); });
  return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
}

/* ---------- 人物绘制 ---------- */
function drawFigure(ctx, f, th, t) {
  const breathe = Math.sin(t * 1.6) * 1.6;
  const sway = Math.sin(t * 0.9) * 0.9;

  ctx.save();
  ctx.translate(f.tx, 0);
  ctx.rotate(f.rot * Math.PI / 180);
  ctx.translate(0, breathe + sway);

  const shoulderY = -80;
  const waistY = -6;
  const hemY = 128;
  const sho = { x: 26, y: shoulderY };

  /* ---- 地面影子 ---- */
  ctx.save();
  ctx.globalAlpha = 0.32 * f.vis;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(0, hemY + 2, 50 + Math.abs(f.rot) * 0.6, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* ---- 袍身（从肩到下摆的一整片轮廓，避免身体被切成两截）---- */
  const wave = Math.sin(t * 1.9) * 4;
  const shW = 26, hemW = 46;
  ctx.beginPath();
  ctx.moveTo(-shW, shoulderY + 6);
  ctx.bezierCurveTo(-shW - 4, 4, -hemW + 3, 62, -hemW + wave * 0.4, hemY);
  ctx.quadraticCurveTo(0, hemY + 12 + wave, hemW + wave * 0.4, hemY);
  ctx.bezierCurveTo(hemW - 3, 62, shW + 4, 4, shW, shoulderY + 6);
  ctx.quadraticCurveTo(0, shoulderY - 8, -shW, shoulderY + 6);
  ctx.closePath();
  const rg = ctx.createLinearGradient(0, shoulderY, 0, hemY);
  rg.addColorStop(0, th.robeDark);
  rg.addColorStop(0.35, th.robe);
  rg.addColorStop(1, th.robeDark);
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  /* 前襟：一条从领口斜向右下的衣缘，交代「右衽」*/
  ctx.beginPath();
  ctx.moveTo(-shW * 0.62, shoulderY + 8);
  ctx.quadraticCurveTo(-4, shoulderY + 30, hemW * 0.34, hemY - 12);
  ctx.lineTo(hemW * 0.52, hemY - 14);
  ctx.quadraticCurveTo(6, shoulderY + 34, -shW * 0.30, shoulderY + 8);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.09)';
  ctx.fill();
  ctx.strokeStyle = th.trim;
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  /* 下摆绣边 */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(-hemW + 2 + wave * 0.4, hemY - 8);
  ctx.quadraticCurveTo(0, hemY + 5 + wave, hemW - 2 + wave * 0.4, hemY - 8);
  ctx.lineWidth = 3.2;
  ctx.strokeStyle = th.trim;
  ctx.globalAlpha = 0.85;
  ctx.stroke();
  ctx.restore();

  /* ---- 腰带与飘带 ---- */
  ctx.fillStyle = th.sash;
  ctx.fillRect(-shW - 1, waistY - 9, (shW + 1) * 2, 13);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(-shW - 1, waistY + 1, (shW + 1) * 2, 3);
  const tassel = Math.sin(t * 2.4) * 5;
  ctx.strokeStyle = th.trim;
  ctx.lineWidth = 2.6;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.moveTo(-4, waistY + 4);
  ctx.quadraticCurveTo(-10 + tassel, 56, -14 + tassel * 1.6, 100);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(4, waistY + 4);
  ctx.quadraticCurveTo(10 - tassel, 56, 14 - tassel * 1.6, 100);
  ctx.stroke();
  ctx.globalAlpha = 1;
  /* ---- 手臂与水袖（先画袖，再画手，最后画手部道具） ---- */
  const joints = [
    { side: -1, j: armJoints({ x: -sho.x, y: sho.y }, f.h[0]), s: f.sx, sy: f.sy },
    { side: 1, j: armJoints({ x: sho.x, y: sho.y }, f.h[1]), s: f.sx, sy: f.sy }
  ];

  joints.forEach(function (a) {
    const j = a.j;
    const L = Math.max(0, a.s) * 0.8;          /* 袖长（从腕部开始下垂） */
    const dirX = j.hx - j.ex, dirY = j.hy - j.ey;
    const dl = Math.max(1, Math.hypot(dirX, dirY));

    /* ① 臂与袖一体：从肩到腕的粗笔触，就是广袖的形 */
    ctx.strokeStyle = th.robe;
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(j.sh.x, j.sh.y);
    ctx.quadraticCurveTo(j.ex, j.ey, j.hx, j.hy);
    ctx.stroke();

    /* ② 水袖：自腕部垂下的白练（方向以「向下」为主，略随臂向倾斜） */
    if (L > 6) {
      const ux = dirX / dl, uy = dirY / dl;
      const sgn = ux >= 0 ? 1 : -1;            /* 朝身体外侧 */
      const ddx = ux * sgn * 0.42;             /* 下垂方向：向下 + 略微向外 */
      const ddy = 0.95;
      const dn = Math.hypot(ddx, ddy);
      const nx = ddx / dn, ny = ddy / dn;      /* 单位下垂方向 */
      const px = -ny, py = nx;                 /* 垂直于它的横向 */
      const hw = 8.5, tw = 13;
      const tipX = j.hx + nx * L;
      const tipY = j.hy + ny * L;
      ctx.beginPath();
      ctx.moveTo(j.hx + px * hw, j.hy + py * hw);
      ctx.quadraticCurveTo(
        j.hx + nx * L * 0.5 + px * (hw + 5), j.hy + ny * L * 0.5 + py * (hw + 5),
        tipX + px * tw, tipY + py * tw
      );
      ctx.quadraticCurveTo(tipX + nx * 5, tipY + ny * 5, tipX - px * tw, tipY - py * tw);
      ctx.quadraticCurveTo(
        j.hx + nx * L * 0.45 - px * (hw + 1), j.hy + ny * L * 0.45 - py * (hw + 1),
        j.hx - px * hw, j.hy - py * hw
      );
      ctx.closePath();
      const sg = ctx.createLinearGradient(j.hx, j.hy, tipX, tipY);
      sg.addColorStop(0, 'rgba(255,255,255,0.98)');
      sg.addColorStop(0.55, svMix(th.trim, '#FFFFFF', 0.55));
      sg.addColorStop(1, 'rgba(255,255,255,0.72)');
      ctx.fillStyle = sg;
      ctx.globalAlpha = 0.94;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 0.9;
      ctx.stroke();
    }

    /* ③ 袖口与衣缘的描边，让轮廓更清楚 */
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(j.sh.x, j.sh.y);
    ctx.quadraticCurveTo(j.ex, j.ey, j.hx, j.hy);
    ctx.stroke();
  });

  joints.forEach(function (a) {
    ctx.beginPath();
    ctx.arc(a.j.hx, a.j.hy, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = SV.skin;
    ctx.fill();
    ctx.strokeStyle = SV.skinShade;
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  /* ---- 肩部披领 ---- */
  ctx.beginPath();
  ctx.moveTo(-sho.x - 8, shoulderY + 4);
  ctx.quadraticCurveTo(0, shoulderY - 12, sho.x + 8, shoulderY + 4);
  ctx.quadraticCurveTo(0, shoulderY + 16, -sho.x - 8, shoulderY + 4);
  ctx.closePath();
  ctx.fillStyle = th.trim;
  ctx.globalAlpha = 0.92;
  ctx.fill();
  ctx.globalAlpha = 1;

  /* ---- 头 ---- */
  const hy = -118 + f.hb;
  ctx.beginPath();
  ctx.moveTo(-12, shoulderY - 2);
  ctx.lineTo(12, shoulderY - 2);
  ctx.lineTo(11, hy + 24);
  ctx.lineTo(-11, hy + 24);
  ctx.closePath();
  ctx.fillStyle = SV.skinShade;
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(0, hy, 18, 21, 0, 0, Math.PI * 2);
  const fg = ctx.createLinearGradient(-19, hy - 23, 19, hy + 23);
  fg.addColorStop(0, '#FFF0DC');
  fg.addColorStop(1, SV.skin);
  ctx.fillStyle = fg;
  ctx.fill();

  drawFace(ctx, th, hy, t);
  drawHeaddress(ctx, th, hy, t);

  /* ---- 道具（最后绘制，压在手上） ---- */
  drawProp(ctx, th, joints, f, t);

  /* ---- 髯口 ---- */
  if (th.face === 'laosheng') {
    const held = f.pr;
    ctx.beginPath();
    ctx.moveTo(-9, hy + 16);
    ctx.quadraticCurveTo(-12 - held * 2, hy + 40, -6, hy + 58 + held * 4);
    ctx.quadraticCurveTo(0, hy + 63 + held * 5, 6, hy + 58 + held * 4);
    ctx.quadraticCurveTo(12 + held * 2, hy + 40, 9, hy + 16);
    ctx.closePath();
    ctx.fillStyle = th.beard || '#2B2724';
    ctx.globalAlpha = 0.95;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  ctx.restore();
}

/* ---------- 面部 ---------- */
function drawFace(ctx, th, hy, t) {
  const blink = 0.62 + 0.38 * Math.abs(Math.sin(t * 0.7));
  /* 胭脂 / 眼周红晕 */
  if (th.face === 'dan') {
    ctx.save();
    ctx.globalAlpha = 0.5;
    const rg = ctx.createRadialGradient(0, hy + 2, 2, 0, hy + 2, 17);
    rg.addColorStop(0, 'rgba(214,84,116,0.75)');
    rg.addColorStop(1, 'rgba(214,84,116,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(0, hy + 2, 17, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* 眼睛 */
  ctx.fillStyle = SV.inkLine;
  [[-7.6, 0], [7.6, 0]].forEach(function (p, i) {
    const dir = i === 0 ? -1 : 1;
    ctx.save();
    ctx.translate(p[0], hy + p[1] + 1);
    ctx.rotate(dir * (th.face === 'dan' ? 0.3 : th.face === 'chou' ? 0.44 : 0.16));
    ctx.beginPath();
    ctx.ellipse(0, 0, 3.6, 2.3 * blink, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  /* 眼线（旦角更重更长） */
  ctx.strokeStyle = SV.inkLine;
  ctx.lineWidth = th.face === 'dan' ? 1.5 : 0.9;
  ctx.beginPath();
  ctx.moveTo(-12, hy - 2);
  ctx.quadraticCurveTo(-7.6, hy - 4.6, -3.4, hy - 1.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(12, hy - 2);
  ctx.quadraticCurveTo(7.6, hy - 4.6, 3.4, hy - 1.4);
  ctx.stroke();

  /* 眉毛 */
  const browY = hy - 8;
  ctx.strokeStyle = SV.inkLine;
  if (th.brow === 'willow') {
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(-13, browY + 1);
    ctx.quadraticCurveTo(-7, browY - 4, -2, browY - 1.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, browY + 1);
    ctx.quadraticCurveTo(7, browY - 4, 2, browY - 1.5);
    ctx.stroke();
  } else if (th.brow === 'thin') {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-12, browY + 1);
    ctx.quadraticCurveTo(-7, browY - 2, -2.4, browY - 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, browY + 1);
    ctx.quadraticCurveTo(7, browY - 2, 2.4, browY - 0.5);
    ctx.stroke();
  } else if (th.brow === 'comic') {
    ctx.lineWidth = 2.1;
    ctx.beginPath();
    ctx.moveTo(-13, browY - 3);
    ctx.quadraticCurveTo(-7, browY + 1, -2, browY + 2.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, browY - 3);
    ctx.quadraticCurveTo(7, browY + 1, 2, browY + 2.5);
    ctx.stroke();
  } else {
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-13, browY + 1.5);
    ctx.quadraticCurveTo(-7, browY - 4, -1.6, browY - 1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, browY + 1.5);
    ctx.quadraticCurveTo(7, browY - 4, 1.6, browY - 1);
    ctx.stroke();
  }

  /* 鼻 */
  ctx.strokeStyle = 'rgba(120,80,60,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, hy + 2);
  ctx.lineTo(-1.2, hy + 7);
  ctx.stroke();

  /* 口 */
  const lipOpen = th.face === 'chou' ? 1.5 + Math.sin(t * 3.2) * 0.5 : 0;
  ctx.fillStyle = th.face === 'dan' ? '#C8385A' : th.face === 'chou' ? '#9E2B34' : '#B4545C';
  ctx.beginPath();
  ctx.ellipse(0, hy + 13, th.face === 'dan' ? 4.6 : 3.6, 2.2 + lipOpen * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  /* 丑角鼻梁白粉块 */
  if (th.face === 'chou') {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-6.5, hy - 1);
    ctx.lineTo(6.5, hy - 1);
    ctx.lineTo(5, hy + 9);
    ctx.lineTo(-5, hy + 9);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.strokeStyle = SV.inkLine;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }
}

/* ---------- 头饰 ---------- */
function drawHeaddress(ctx, th, hy, t) {
  const wob = Math.sin(t * 2.6) * 2.2;
  ctx.save();

  if (th.hat === 'cap' || th.hat === 'wenjin') {
    /* 文生巾 / 将巾：帽檐贴额，帽顶收窄 */
    ctx.beginPath();
    ctx.moveTo(-19, hy - 14);
    ctx.quadraticCurveTo(0, hy - 33, 19, hy - 14);
    ctx.lineTo(18, hy - 7);
    ctx.quadraticCurveTo(0, hy - 19, -18, hy - 7);
    ctx.closePath();
    ctx.fillStyle = th.hatColor;
    ctx.fill();
    ctx.strokeStyle = th.hatTrim;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    /* 帽后垂带 */
    ctx.strokeStyle = th.hatTrim;
    ctx.lineWidth = 2.2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(15, hy - 14);
    ctx.quadraticCurveTo(28 + wob, hy + 4, 26 + wob * 1.6, hy + 30);
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (th.hat === 'wenjin') {
      /* 巾顶玉饰 */
      ctx.beginPath();
      ctx.arc(0, hy - 26, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = th.hatTrim;
      ctx.fill();
    }
  } else if (th.hat === 'crown') {
    /* 旦角头面：额前珠串 + 小正凤 + 侧垂珠 */
    ctx.beginPath();
    ctx.moveTo(-20, hy - 10);
    ctx.quadraticCurveTo(0, hy - 34, 20, hy - 10);
    ctx.lineTo(19, hy - 2);
    ctx.quadraticCurveTo(0, hy - 14, -19, hy - 2);
    ctx.closePath();
    ctx.fillStyle = '#1A1214';
    ctx.fill();
    /* 珠串（紧贴发际，宽度收窄避免盖住脸） */
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(i * 5.2, hy - 13 - Math.cos(i * 0.55) * 3.4, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? th.hatTrim : '#FFFFFF';
      ctx.fill();
    }
    /* 正凤：收小，向上立起 */
    ctx.beginPath();
    ctx.moveTo(0, hy - 26);
    ctx.quadraticCurveTo(-4, hy - 30, -8, hy - 28.5);
    ctx.quadraticCurveTo(-4, hy - 26.5, -1.6, hy - 22);
    ctx.closePath();
    ctx.fillStyle = th.hatTrim;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, hy - 26);
    ctx.quadraticCurveTo(4, hy - 30, 8, hy - 28.5);
    ctx.quadraticCurveTo(4, hy - 26.5, 1.6, hy - 22);
    ctx.closePath();
    ctx.fill();
    /* 侧垂珠（随动作轻晃，长度收紧） */
    ctx.strokeStyle = th.hatTrim;
    ctx.lineWidth = 1.1;
    [-1, 1].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s * 18, hy - 6);
      ctx.quadraticCurveTo(s * 22 + wob * s * 0.5, hy + 8, s * 20 + wob * s * 0.8, hy + 20);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(s * 20 + wob * s * 0.8, hy + 21.5, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    });
  } else if (th.hat === 'helmet') {
    /* 帅盔 + 翎子（翎子向后上方弯，避免横向铺开） */
    ctx.beginPath();
    ctx.moveTo(-21, hy - 8);
    ctx.quadraticCurveTo(0, hy - 44, 21, hy - 8);
    ctx.lineTo(20, hy + 2);
    ctx.quadraticCurveTo(0, hy - 12, -20, hy + 2);
    ctx.closePath();
    ctx.fillStyle = th.hatColor;
    ctx.fill();
    ctx.strokeStyle = th.hatTrim;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-14, hy - 18);
    ctx.quadraticCurveTo(0, hy - 30, 14, hy - 18);
    ctx.strokeStyle = th.hatTrim;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    /* 护心镜式额饰 */
    ctx.beginPath();
    ctx.arc(0, hy - 10, 4, 0, Math.PI * 2);
    ctx.fillStyle = th.hatTrim;
    ctx.fill();
    /* 翎子 */
    ctx.strokeStyle = 'rgba(232,226,212,0.9)';
    ctx.lineWidth = 2;
    [-1, 1].forEach(function (s) {
      ctx.beginPath();
      ctx.moveTo(s * 13, hy - 22);
      ctx.bezierCurveTo(s * 18, hy - 44, s * 12, hy - 62, s * 20, hy - 78);
      ctx.stroke();
    });
  } else if (th.hat === 'bun') {
    /* 丑角：歪髻 + 小帽 */
    ctx.beginPath();
    ctx.arc(-12, hy - 22, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#1A1214';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-22, hy - 8);
    ctx.quadraticCurveTo(0, hy - 30, 20, hy - 6);
    ctx.lineTo(19, hy + 1);
    ctx.quadraticCurveTo(0, hy - 12, -21, hy + 1);
    ctx.closePath();
    ctx.fillStyle = th.hatColor;
    ctx.fill();
    ctx.strokeStyle = th.hatTrim;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(14, hy - 20, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = th.hatTrim;
    ctx.fill();
  }

  /* 鬓发 */
  ctx.fillStyle = th.hair;
  ctx.beginPath();
  ctx.ellipse(-18, hy - 2, 5, 11, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(18, hy - 2, 5, 11, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/* ---------- 道具 ---------- */
function drawProp(ctx, th, joints, f, t) {
  const rj = joints[1].j; /* 右手（画面右侧） */
  const lj = joints[0].j;

  if (th.prop === 'blade') {
    /* 宝剑：从右手向外延伸，pr 控制拔出长度与角度 */
    const p = f.pr;
    const ang = (-58 + p * 96) * Math.PI / 180;
    const len = 30 + p * 92;
    const hx = rj.hx, hy = rj.hy;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(ang);
    /* 剑柄 */
    ctx.strokeStyle = '#7B5A22';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-12, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();
    /* 护手 */
    ctx.strokeStyle = th.trim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(3, -6);
    ctx.lineTo(3, 6);
    ctx.stroke();
    /* 剑身 */
    const bg = ctx.createLinearGradient(3, 0, len, 0);
    bg.addColorStop(0, '#FFFFFF');
    bg.addColorStop(0.5, th.propColor || '#D9DEE3');
    bg.addColorStop(1, 'rgba(255,255,255,0.15)');
    ctx.beginPath();
    ctx.moveTo(3, -3.2);
    ctx.lineTo(len - 12, -2.4);
    ctx.lineTo(len, 0);
    ctx.lineTo(len - 12, 2.4);
    ctx.lineTo(3, 3.2);
    ctx.closePath();
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();
    /* 剑光 */
    if (p > 0.35) {
      ctx.save();
      ctx.globalAlpha = (p - 0.35) * 0.5;
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(hx + Math.cos(ang) * 10, hy + Math.sin(ang) * 10);
      ctx.lineTo(hx + Math.cos(ang) * (len + 14), hy + Math.sin(ang) * (len + 14));
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  if (th.prop === 'sword') {
    /* 单刀 / 短剑（二帮花旦） */
    const p = f.pr;
    const ang = (150 - p * 250) * Math.PI / 180;
    const len = 26 + p * 74;
    ctx.save();
    ctx.translate(rj.hx, rj.hy);
    ctx.rotate(ang);
    ctx.strokeStyle = '#6E4A1E';
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(2, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2, -5);
    ctx.lineTo(len, -1.6);
    ctx.lineTo(len + 8, 0);
    ctx.lineTo(len, 1.6);
    ctx.lineTo(2, 5);
    ctx.closePath();
    const bg = ctx.createLinearGradient(2, 0, len, 0);
    bg.addColorStop(0, '#F2F5F7');
    bg.addColorStop(1, th.propColor || '#E2E6EA');
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.restore();
    return;
  }

  if (th.prop === 'fan') {
    /* 折扇：pr 控制展开 */
    const p = f.pr;
    if (p <= 0.05) {
      /* 合扇：一根短棍 */
      ctx.save();
      ctx.translate(rj.hx, rj.hy);
      ctx.rotate(-0.7);
      ctx.strokeStyle = '#7B5A22';
      ctx.lineWidth = 3.4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(34, 0);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const open = 12 + p * 132; /* 展开角度 */
    const R = 50;
    ctx.save();
    ctx.translate(rj.hx, rj.hy);
    ctx.rotate((-open / 2 - 22) * Math.PI / 180);
    const a0 = 0, a1 = open * Math.PI / 180;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a0, a1);
    ctx.closePath();
    const fgd = ctx.createRadialGradient(0, 0, 6, 0, 0, R);
    fgd.addColorStop(0, '#FFFFFF');
    fgd.addColorStop(1, th.fanColor || th.trim);
    ctx.fillStyle = fgd;
    ctx.globalAlpha = 0.96;
    ctx.fill();
    ctx.strokeStyle = 'rgba(90,60,40,0.55)';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    /* 扇骨 */
    ctx.globalAlpha = 0.5;
    for (let i = 0; i <= 8; i++) {
      const a = a0 + (a1 - a0) * i / 8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return;
  }

  if (th.prop === 'beard') {
    /* 髯口由 drawFigure 负责，这里补一只执笏的手势道具 */
    if (f.pr > 0.5) {
      ctx.save();
      ctx.globalAlpha = (f.pr - 0.5) * 2 * 0.9;
      ctx.translate(lj.hx, lj.hy);
      ctx.rotate(-0.5);
      ctx.fillStyle = '#E8D9B5';
      ctx.fillRect(-6, -3, 44, 7);
      ctx.strokeStyle = 'rgba(90,60,30,0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-6, -3, 44, 7);
      ctx.restore();
    }
    return;
  }
}

/* ---------- 舞台层 ---------- */
function drawStage(ctx, w, h, th, t, pulse) {
  /* 背景 */
  const bg = ctx.createRadialGradient(0, -70, 10, 0, 40, h * 0.95);
  bg.addColorStop(0, 'rgba(201,162,39,0.16)');
  bg.addColorStop(0.35, 'rgba(163,40,44,0.16)');
  bg.addColorStop(1, 'rgba(11,7,9,0)');
  ctx.fillStyle = bg;
  ctx.fillRect(-w / 2, -h / 2, w, h);

  /* 追光 */
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const spot = ctx.createRadialGradient(0, -20, 4, 0, -10, 190);
  spot.addColorStop(0, 'rgba(255,238,200,' + (0.16 + pulse * 0.14) + ')');
  spot.addColorStop(1, 'rgba(255,238,200,0)');
  ctx.fillStyle = spot;
  ctx.beginPath();
  ctx.ellipse(0, -10, 170, 175, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* 地台 */
  const floorY = 138;
  const fg = ctx.createLinearGradient(0, floorY - 6, 0, h / 2);
  fg.addColorStop(0, 'rgba(201,162,39,0.30)');
  fg.addColorStop(0.4, 'rgba(201,162,39,0.07)');
  fg.addColorStop(1, 'rgba(11,7,9,0)');
  ctx.fillStyle = fg;
  ctx.fillRect(-w / 2, floorY - 6, w, h / 2 - floorY + 6);

  /* 地台光边 */
  ctx.save();
  ctx.globalAlpha = 0.5 + pulse * 0.3;
  const eg = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  eg.addColorStop(0, 'rgba(201,162,39,0)');
  eg.addColorStop(0.5, 'rgba(227,197,103,0.85)');
  eg.addColorStop(1, 'rgba(201,162,39,0)');
  ctx.fillStyle = eg;
  ctx.fillRect(-w / 2, floorY - 1.5, w, 2.2);
  ctx.restore();

  /* 背景竖幔 */
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.strokeStyle = 'rgba(200,56,90,0.9)';
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    const x = i * 74;
    ctx.beginPath();
    ctx.moveTo(x, -h / 2);
    ctx.quadraticCurveTo(x + Math.sin(t * 0.6 + i) * 8, 0, x, floorY - 8);
    ctx.stroke();
  }
  ctx.restore();

  /* 光尘 */
  const rnd = mulberry32(20260501);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 34; i++) {
    const bx = (rnd() - 0.5) * w * 1.05;
    const by = (rnd() - 0.5) * h * 1.05;
    const sp = 0.15 + rnd() * 0.5;
    const ph = rnd() * Math.PI * 2;
    const x = bx + Math.sin(t * sp + ph) * 10;
    const y = by - ((t * (6 + sp * 14) + ph * 30) % (h + 60)) + h / 3;
    const a = 0.12 + 0.3 * Math.abs(Math.sin(t * 0.9 + ph));
    ctx.globalAlpha = a * (0.4 + pulse * 0.6);
    ctx.fillStyle = i % 3 === 0 ? '#E3C567' : '#FFF3DA';
    ctx.beginPath();
    ctx.arc(x, y, 0.9 + (i % 3) * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/* ---------- 关键帧插值 ---------- */
function sampleChoreo(frames, t) {
  const last = frames[frames.length - 1];
  let a = frames[0], b = frames[0];
  if (t <= frames[0].t) { a = b = frames[0]; }
  else if (t >= last.t) { a = b = last; }
  else {
    for (let i = 0; i < frames.length - 1; i++) {
      if (t >= frames[i].t && t <= frames[i + 1].t) { a = frames[i]; b = frames[i + 1]; break; }
    }
  }
  const span = Math.max(0.0001, b.t - a.t);
  const raw = a === b ? 1 : clamp((t - a.t) / span, 0, 1);
  const p = easeInOutSine(raw);

  function num(key, dflt) {
    const va = a[key] === undefined ? dflt : a[key];
    const vb = b[key] === undefined ? dflt : b[key];
    return lerp(va, vb, p);
  }

  const out = {
    vis: num('vis', 0), tx: num('tx', 0), rot: num('rot', 0), hb: num('hb', 0),
    lean: num('lean', 0), sx: num('sx', 0), sy: num('sy', 0),
    pr: num('pr', 0), glow: num('glow', 0.3), ripple: num('ripple', 0), h: []
  };
  for (let i = 0; i < 2; i++) {
    const ha = a.h[i], hb2 = b.h[i];
    out.h.push({
      x: lerp(ha.x, hb2.x, p),
      y: lerp(ha.y, hb2.y, p),
      ca: lerp(ha.ca, hb2.ca, p),
      ha: lerp(ha.ha, hb2.ha, p)
    });
  }
  /* 标量脉动，让动作在关键帧之间有呼吸 */
  const jitter = Math.sin(t * 5.1) * 0.4 * (1 - p);
  out.hb += jitter;
  return out;
}

/* ---------- 对外入口 ---------- */
function createCharacterStage(canvas, roleId, opts) {
  opts = opts || {};
  const th = FIGURE_THEME[roleId] || FIGURE_THEME.wenwusheng;
  const frames = CHOREO[roleId] || CHOREO.wenwusheng;
  const endTime = frames[frames.length - 1].t;
  const ctx = canvas.getContext('2d');
  let start = 0, raf = 0, W = 0, H = 0, DPR = 1;
  let loop = opts.loop !== false;

  function resize() {
    const box = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(160, box.width);
    H = Math.max(120, box.height);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
  }

  function frame(now) {
    if (!start) start = now;
    const t = (now - start) / 1000;
    const frozen = t > endTime + 0.2 ? sampleChoreo(frames, endTime).vis : 0;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(DPR, DPR);
    /* 统一到「以人物中心为原点」的坐标系 */
    ctx.translate(W / 2, H * 0.66);

    const f = sampleChoreo(frames, Math.min(t, endTime));
    const idle = Math.max(0, t - endTime);
    /* 定格后的微动 */
    if (idle > 0) { f.hb += Math.sin(idle * 1.5) * 1.1; f.rot += Math.sin(idle * 0.8) * 0.6; }
    const pulse = clamp(f.glow, 0, 1) * (0.72 + 0.28 * Math.abs(Math.sin(t * 1.5)));
    const scale = Math.min(1.5, Math.min(W, 520) / 250);
    ctx.save();
    ctx.scale(scale, scale);

    drawStage(ctx, W / scale, H / scale, th, t, pulse);

    /* 人物 + 拖影 */
    if (f.vis > 0.01) {
      ctx.save();
      ctx.globalAlpha = f.vis;
      drawFigure(ctx, f, th, t);
      ctx.restore();

      /* 地台倒影 */
      ctx.save();
      ctx.globalAlpha = 0.14 * f.vis;
      ctx.translate(0, 277);
      ctx.scale(1, -0.5);
      ctx.filter = 'blur(1.5px)';
      drawFigure(ctx, f, th, t);
      ctx.restore();
    }

    /* 落地涟漪 */
    if (f.ripple > 0.01) {
      const rr = (1 - f.ripple) * 130 + 20;
      ctx.save();
      ctx.globalAlpha = f.ripple * 0.4;
      ctx.strokeStyle = '#E3C567';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.ellipse(0, 136, rr, rr * 0.16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
    raf = requestAnimationFrame(frame);
  }

  function play() {
    resize();
    start = 0;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  play();

  const onResize = function () { resize(); };
  window.addEventListener('resize', onResize);

  return {
    replay: play,
    stop: function () { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); },
    role: roleId
  };
}

/* ---------- 首页/列表用的小型静态剪影 ---------- */
function drawMiniFigure(ctx, roleId, w, h, phase) {
  const th = FIGURE_THEME[roleId] || FIGURE_THEME.wenwusheng;
  const role = ROLES[roleId];
  const anim = role && role.animation ? role.animation.type : 'sleeve';
  const frames = CHOREO[roleId] || CHOREO.wenwusheng;
  const t = frames[frames.length - 1].t;
  const f = sampleChoreo(frames, t);
  if (phase) { f.hb += Math.sin(phase * 1.4) * 1.2; }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h * 0.82);
  const s = Math.min(w / 150, h / 210);
  ctx.scale(s, s);
  const t0 = phase || 0;
  drawFigure(ctx, f, th, t0);
  ctx.restore();
}
