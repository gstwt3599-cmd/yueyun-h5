/* ============================================================
 * 粤韵新声 · 匹配算法
 * 规则：12 道题 → 累计 6 个维度得分（A~F）→ 维度按权重折算行当得分
 *      → 最高分即匹配行当；若出现同分，用「首题倾向」与「作答顺序」决胜。
 * ============================================================ */

const DIM_LABEL = {
  A: '气场与担当', B: '才情与审美', C: '温度与亲和',
  D: '机趣与应变', E: '韧劲与锋芒', F: '掌控与分寸'
};

/**
 * @param {Array<number>} answers 每题所选选项下标（与 QUESTIONS 对应）
 * @returns {{ roleId:string, scores:Object, dims:Object, ranking:Array, tieBreak:boolean }}
 */
function computeMatch(answers) {
  const dims = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };

  answers.forEach(function (optIndex, qi) {
    const q = QUESTIONS[qi];
    if (!q) return;
    const opt = q.options[optIndex];
    if (!opt) return;
    Object.keys(opt.w).forEach(function (dim) {
      dims[dim] = (dims[dim] || 0) + opt.w[dim];
    });
  });

  /* 维度 → 行当（两步归一化，参数见 data.js 的 MATCH_TUNING） */
  const alpha = (typeof MATCH_TUNING !== 'undefined' && MATCH_TUNING.alpha != null) ? MATCH_TUNING.alpha : 0.2;
  const useReach = (typeof MATCH_TUNING !== 'undefined' && MATCH_TUNING.normalize === 'reach');

  /* ① 维度权威度：出现越多的维度权重越低（用问卷自身的选项权重统计） */
  const freq = {};
  Object.keys(DIM_TO_ROLE).forEach(function (d) { freq[d] = 0; });
  QUESTIONS.forEach(function (q) {
    q.options.forEach(function (o) {
      Object.keys(o.w).forEach(function (d) { if (freq[d] !== undefined) freq[d] += o.w[d]; });
    });
  });
  const k = {};
  Object.keys(DIM_TO_ROLE).forEach(function (d) {
    const map = DIM_TO_ROLE[d];
    let sum = 0;
    Object.keys(map).forEach(function (rid) { sum += map[rid]; });
    k[d] = sum > 0 ? Math.pow(Math.max(1, freq[d]), alpha) / sum : 0;
  });

  /* ② 行当起点归一：让六根柱子在「均匀作答」下的理论最高分一致 */
  const roleK = {};
  ROLE_ORDER.forEach(function (rid) { roleK[rid] = 1; });
  if (useReach) {
    const reach = {};
    ROLE_ORDER.forEach(function (rid) {
      let s = 0;
      Object.keys(DIM_TO_ROLE).forEach(function (d) {
        const w = DIM_TO_ROLE[d][rid];
        if (w) s += freq[d] * k[d] * w;
      });
      reach[rid] = s;
    });
    let avg = 0;
    ROLE_ORDER.forEach(function (rid) { avg += reach[rid]; });
    avg = avg / ROLE_ORDER.length;
    ROLE_ORDER.forEach(function (rid) { roleK[rid] = reach[rid] > 0 ? avg / reach[rid] : 1; });
  }

  const scores = {};
  ROLE_ORDER.forEach(function (rid) { scores[rid] = 0; });
  Object.keys(DIM_TO_ROLE).forEach(function (dim) {
    const map = DIM_TO_ROLE[dim];
    Object.keys(map).forEach(function (rid) {
      scores[rid] += (dims[dim] || 0) * map[rid] * k[dim] * roleK[rid];
    });
  });

  /* 决胜：若前两名极为接近，用「第一题的选择更贴近谁」来定序
   * （只在分差 < 1% 时生效，不会影响相似度条的整体形态） */
  let order = ROLE_ORDER.slice().sort(function (a, b) { return scores[b] - scores[a]; });
  let tieBreak = false;
  if (order.length > 1) {
    const gap = scores[order[0]] - scores[order[1]];
    const scale = Math.max(0.0001, scores[order[0]]);
    if (gap / scale < 0.01) {
      const firstOpt = QUESTIONS[0] && QUESTIONS[0].options[answers[0]];
      if (firstOpt) {
        const lean = {};
        order.forEach(function (rid) { lean[rid] = 0; });
        Object.keys(firstOpt.w).forEach(function (dim) {
          const map = DIM_TO_ROLE[dim] || {};
          Object.keys(map).forEach(function (rid) { lean[rid] = (lean[rid] || 0) + firstOpt.w[dim] * map[rid]; });
        });
        const a = order[0], b = order[1];
        if ((lean[b] || 0) > (lean[a] || 0) + 0.001) {
          order[0] = b; order[1] = a;
          tieBreak = true;
        }
      }
    }
  }

  const ranking = order.map(function (rid) {
    return { id: rid, name: ROLES[rid].name, score: scores[rid] };
  });

  return {
    roleId: ranking[0].id,
    scores: scores,
    dims: dims,
    ranking: ranking,
    tieBreak: tieBreak
  };
}

/** 结果页用：把原始分折算成百分比条 */
function toPercentBars(ranking) {
  const max = ranking[0].score || 1;
  const min = ranking[ranking.length - 1].score;
  return ranking.map(function (r) {
    /* 把最低分压到 8%，最高分到 100%，让差异更直观 */
    const p = min === max ? 100 : 8 + (r.score - min) / (max - min) * 92;
    return { id: r.id, name: r.name, percent: Math.round(p), score: Math.round(r.score * 10) / 10 };
  });
}

/** 找出用户最强的两个维度（用于结果页的「你的关键词」） */
function topDims(dims, n) {
  const arr = Object.keys(dims).map(function (k) { return { key: k, label: DIM_LABEL[k], v: dims[k] }; });
  arr.sort(function (a, b) { return b.v - a.v; });
  return arr.slice(0, n || 2);
}
