// ── Command Interpreter ───────────────────────────────────────
// Natural-language → structured conversion intent.
// Pure: takes (text, lang) and returns an intent object.
// app.js applies the intent to conversionState and reports `reply`.
//
// Intent shape:
//   {
//     patch:    { ...conversionState fields to merge },   // optional
//     optimize: false,                                     // run optimizeForDotPad
//     action:   null | 'send' | 'braille' | 'clear' | 'invert' | 'reset',
//     reply:    'human-readable summary (current lang)',
//     matched:  true,                                      // did anything match?
//   }

import { isMathLike, normalizeExpr } from './mathgraph.js';

const R = (ko, en) => ({ ko, en });

// Pick the Korean object particle 을/를 by final-consonant (받침) of the last char.
function josaEulReul(word) {
  const c = word.charCodeAt(word.length - 1);
  if (c < 0xAC00 || c > 0xD7A3) return '를';
  return ((c - 0xAC00) % 28) !== 0 ? '을' : '를';
}

// Each rule: { test, patch?, optimize?, action?, reply }
// `reply` is {ko, en}. Rules are evaluated in order; later patches win on conflict.
const RULES = [
  {
    test: /최적화|optimi[sz]e|읽기\s*쉽게|가독|readable|dotpad에?\s*맞게|핀에?\s*맞게|tactile|촉각.*최적/i,
    optimize: true,
    reply: R('Dot Pad 가독성에 맞춰 자동 최적화했어요', 'Optimized for Dot Pad readability'),
  },
  {
    test: /단순|간단|심플|simpl/i,
    patch: { outline: 1, minComp: 4, denoise: true, edge: 'none' },
    reply: R('윤곽선 중심으로 단순하게 변환했어요', 'Simplified to outline-focused form'),
  },
  {
    test: /또렷|선명|디테일|자세|detail|sharp|crisp/i,
    patch: { minComp: 1, outline: 0, denoise: false },
    reply: R('디테일을 살려 또렷하게 변환했어요', 'Brought back detail and crispness'),
  },
  {
    test: /외곽|윤곽|테두리|라인|outline|edge\s*only|contour/i,
    patch: { outline: 1, edge: 'none' },
    reply: R('외곽선만 남겼어요', 'Kept the outline only'),
  },
  {
    test: /두\s*줄|2\s*줄|굵은\s*외곽|double\s*outline/i,
    patch: { outline: 2 },
    reply: R('외곽선을 2줄로 두껍게 했어요', 'Made the outline a 2-line border'),
  },
  {
    test: /채워|채우|면으로|솔리드|fill|solid|filled/i,
    patch: { outline: 0 },
    reply: R('면을 채워서 변환했어요', 'Filled the shapes'),
  },
  {
    test: /굵게|두껍게|진하게|bold|thick|dilat/i,
    patch: { dilate: true, erode: false },
    reply: R('점을 굵게 키웠어요', 'Thickened the strokes'),
  },
  {
    test: /가늘게|얇게|얇은|thin|erode|skeleton/i,
    patch: { erode: true, dilate: false },
    reply: R('점을 가늘게 줄였어요', 'Thinned the strokes'),
  },
  {
    test: /노이즈|잡티|점\s*제거|깨끗|정리|denoise|clean|noise/i,
    patch: { denoise: true, minComp: 4 },
    reply: R('흩어진 점을 정리했어요', 'Cleaned up scattered dots'),
  },
  {
    test: /솎|성기게|덜\s*촘촘|덜\s*빽빽|thin\s*out|\bthin\b|밀도\s*검수|proof/i,
    action: 'thin',
    reply: R('빽빽한 점을 솎아 읽기 쉽게 했어요', 'Thinned crowded dots for readability'),
  },
  {
    test: /점\s*(많|늘|높|진)|더\s*많|밀도\s*(높|올)|more\s*dots|dense|denser/i,
    patch: { method: 'global' },
    deltaThreshold: +24,
    reply: R('점 밀도를 높였어요', 'Increased dot density'),
  },
  {
    test: /점\s*(적|줄|낮|연)|더\s*적|밀도\s*(낮|내)|fewer\s*dots|sparse|lighter/i,
    patch: { method: 'global' },
    deltaThreshold: -24,
    reply: R('점 밀도를 낮췄어요', 'Reduced dot density'),
  },
  {
    test: /엣지|에지|sobel|경계\s*감지|edge\s*detect/i,
    patch: { edge: 'sobel', outline: 0 },
    reply: R('Sobel 엣지로 경계를 추출했어요', 'Extracted edges with Sobel'),
  },
  {
    test: /반전|뒤집|invert|negative|flip\s*pin/i,
    action: 'invert',
    reply: R('밝고 어두운 영역을 반전했어요', 'Inverted light and dark areas'),
  },
  {
    test: /점자|브라유|braille/i,
    action: 'braille',
    reply: R('점자 설명을 Dot Pad로 보냈어요', 'Sent the braille description to Dot Pad'),
  },
  {
    test: /보내|전송|출력|send|전달|export\s*to\s*dot/i,
    action: 'send',
    reply: R('Dot Pad로 보냈어요', 'Sent to Dot Pad'),
  },
  {
    test: /전체\s*지|모두\s*지|초기화|클리어|clear\s*all|reset\s*canvas/i,
    action: 'clear',
    reply: R('캔버스를 전부 지웠어요', 'Cleared the whole canvas'),
  },
  {
    test: /처음|원래|되돌|기본값|reset|original|revert/i,
    action: 'reset',
    reply: R('자동 변환 상태로 되돌렸어요', 'Reverted to the auto-converted state'),
  },
];

// ── Creation lexicon: shape keyword → primitive name ─────────
const SHAPE_LEX = [
  [/동그라미|원형|circle|동그란|\b원\b|원\s*그/i, 'circle'],
  [/타원|ellipse|oval/i, 'ellipse'],
  [/정사각|\bsquare\b|네모/i, 'square'],
  [/직사각|사각형|rect|박스|box/i, 'rect'],
  [/세모|삼각|triangle/i, 'triangle'],
  [/마름모|다이아|diamond|rhombus/i, 'diamond'],
  [/대각선|diagonal/i, 'diagonal'],
  [/십자|\bcross\b|plus|\+/i, 'cross'],
  [/엑스|\bx\b자|\bx\b\s*표/i, 'x'],
  [/화살표|arrow|화살/i, 'arrow'],
  [/별표|\bstar\b|\b별\b|별\s*그/i, 'star'],
  [/하트|heart|♥/i, 'heart'],
  [/사인|싸인|sine|sin\b/i, 'sine'],
  [/코사인|cosine|\bcos\b/i, 'cosine'],
  [/물결|파동|wave/i, 'sine'],
  [/테두리|프레임|border|frame|외곽\s*틀/i, 'border'],
  [/격자|모눈|그리드|grid|lattice|좌표/i, 'grid'],
  [/직선|가로선|\bline\b|\b선\b\s*그/i, 'line'],
];

// Detect "draw a shape" intent and extract { shape, fill }.
function detectCreate(s) {
  // require a draw-ish verb OR a bare shape word at the start
  const drawVerb = /그려|그리|만들|넣어|추가|insert|draw|add|생성|create/i.test(s);
  for (const [re, shape] of SHAPE_LEX) {
    if (re.test(s)) {
      if (!drawVerb && !/^\s*(원|별|선|네모|세모|하트|circle|star|line|square|triangle|heart)/i.test(s)) {
        // shape word present but no draw verb and not leading — skip, let transforms handle
        if (!/도형|모양|shape/i.test(s)) continue;
      }
      const fill = /채운|채워|채우|속\s*찬|꽉|filled|solid|fill/i.test(s);
      return { shape, fill };
    }
  }
  return null;
}

// Extract braille text: "점자로 안녕", "안녕 점자로", "점자 안녕하세요"
function detectBrailleText(s, lang) {
  if (!/점자|브라유|braille/i.test(s)) return null;
  let text = s.replace(/점자로|점자|브라유|braille|로\s*(써|적어|변환|만들)|으로|써줘|적어줘|변환|만들어줘|보내줘|출력/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  // strip stray particles
  text = text.replace(/^(을|를|이|가|로|으로)\s*/i, '').trim();
  return text.length ? text : null;  // empty → send existing braille (handled as action)
}

/**
 * Interpret a natural-language command.
 * @param {string} text
 * @param {'ko'|'en'} lang
 * @returns {{patch:object, deltaThreshold:number, optimize:boolean, action:?string, create:?object, brailleText:?string, reply:string, matched:boolean}}
 */
export function interpretCommand(text, lang = 'ko') {
  const s = (text || '').trim();

  // ⓪ Math expressions route to the graph renderer (y=…, f(x)=…, sin(x)…).
  if (isMathLike(s)) {
    return { patch: {}, deltaThreshold: 0, optimize: false, action: 'math',
      create: null, brailleText: null, mathExpr: normalizeExpr(s),
      reply: (lang === 'ko' ? `수식 그래프를 그렸어요` : 'Plotted the graph'), matched: true };
  }

  // ① Creation commands take priority — they synthesize a new graphic.
  const create = detectCreate(s);
  if (create) {
    const koName = { circle:'원', ellipse:'타원', rect:'사각형', square:'정사각형', triangle:'삼각형',
      diamond:'마름모', line:'직선', diagonal:'대각선', cross:'십자', x:'X자', arrow:'화살표',
      star:'별', heart:'하트', sine:'사인파', cosine:'코사인파', border:'테두리', grid:'격자' }[create.shape] || create.shape;
    const reply = lang === 'ko'
      ? `${create.fill ? '채운 ' : ''}${koName}${josaEulReul(koName)} 그렸어요`
      : `Drew a ${create.fill ? 'filled ' : ''}${create.shape}`;
    return { patch: {}, deltaThreshold: 0, optimize: false, action: null, create, brailleText: null, reply, matched: true };
  }

  // ② Braille text → render typed text as braille cells.
  if (/점자|브라유|braille/i.test(s)) {
    const bt = detectBrailleText(s, lang);
    if (bt) {
      return { patch: {}, deltaThreshold: 0, optimize: false, action: 'brailleText', create: null, brailleText: bt,
        reply: (lang === 'ko' ? `"${bt}"를 점자로 변환했어요` : `Rendered "${bt}" as braille`), matched: true };
    }
    // no text → send existing braille description (handled below by 'braille' rule)
  }

  // ③ Sonify — play an audio sweep of the current graphic.
  if (/소리로?\s*(들|확인|재생|듣)|음향|소리\s*나|sonif|play\s*sound|들려/i.test(s)) {
    return { patch: {}, deltaThreshold: 0, optimize: false, action: 'sonify', create: null, brailleText: null,
      reply: (lang === 'ko' ? '소리로 그래픽을 훑어볼게요' : 'Playing an audio sweep'), matched: true };
  }

  // ④ Describe the current graphic.
  if (/설명|묘사|describe|alt\s*text|뭐가\s*있|무엇/i.test(s)) {
    return { patch: {}, deltaThreshold: 0, optimize: false, action: 'describe', create: null, brailleText: null,
      reply: (lang === 'ko' ? '그래픽을 설명할게요' : 'Describing the graphic'), matched: true };
  }

  const patch = {};
  let deltaThreshold = 0;
  let optimize = false;
  let action = null;
  const replies = [];
  let matched = false;

  for (const rule of RULES) {
    if (!rule.test.test(s)) continue;
    matched = true;
    if (rule.patch) Object.assign(patch, rule.patch);
    if (rule.deltaThreshold) deltaThreshold += rule.deltaThreshold;
    if (rule.optimize) optimize = true;
    if (rule.action) action = rule.action;   // last action wins
    replies.push(rule.reply[lang] || rule.reply.ko);
  }

  // optimize wins over manual patches — it computes its own params.
  if (optimize) { Object.keys(patch).forEach(k => delete patch[k]); deltaThreshold = 0; }

  const reply = matched
    ? replies.join(' · ')
    : (lang === 'ko'
        ? '명령을 이해하지 못했어요. "단순하게", "외곽선만", "최적화" 같은 표현을 써보세요.'
        : "Didn't catch that. Try \"simplify\", \"outline only\", or \"optimize\".");

  return { patch, deltaThreshold, optimize, action, create: null, brailleText: null, reply, matched };
}

/**
 * Curated quick commands for the prompt suggestion dropdown.
 * `text` is fed straight back into interpretCommand.
 */
export const QUICK_COMMANDS = [
  { group: { ko: '변환', en: 'Transform' },
    icon: '✨', text: { ko: 'Dot Pad에 맞게 최적화', en: 'Optimize for Dot Pad' }, primary: true },
  { icon: '◯', text: { ko: '외곽선만 남기기',       en: 'Outline only' } },
  { icon: '▢', text: { ko: '더 단순하게',           en: 'Simplify' } },
  { icon: '⊙', text: { ko: '노이즈 정리',           en: 'Clean up noise' } },
  { icon: '⇄', text: { ko: '밝고 어두움 반전',      en: 'Invert' } },

  { group: { ko: '만들기', en: 'Create' },
    icon: '○', text: { ko: '원 그려줘',             en: 'Draw a circle' } },
  { icon: '△', text: { ko: '삼각형 그려줘',         en: 'Draw a triangle' } },
  { icon: 'ƒ', text: { ko: 'y = sin(x)',           en: 'y = sin(x)' } },
  { icon: '▦', text: { ko: '격자 그려줘',           en: 'Draw a grid' } },
  { icon: '⠿', text: { ko: '점자로 안녕하세요',     en: 'Braille: hello' } },
  { icon: '☷', text: { ko: '이 그래픽 설명해줘',    en: 'Describe this graphic' } },
];
