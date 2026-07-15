# T3.6 领域守卫

**状态**：✅ 完整实现
**依赖**：无（领域关键词内嵌在文件中）
**可并行**：是

## 产出文件

- `src/guard.ts`

## 实现内容

```typescript
import type { GuardResult } from "./types.js";

/**
 * 领域关键词词典
 * 分三级权重覆盖聚合反应釜相关术语
 */

/** 核心词：直接指向聚合反应釜领域 */
const CORE_KEYWORDS: [string, number][] = [
  // 设备本体 — 权重 3
  ["反应釜", 3], ["聚合釜", 3], ["聚合反应釜", 3],
  ["搅拌器", 3], ["夹套", 3], ["盘管", 3],
  ["聚合反应", 3], ["放热反应", 3], ["釜体", 3],
  ["高分子", 3], ["自由基聚合", 3], ["悬浮聚合", 3], ["乳液聚合", 3],
];

/** 扩展词：聚合反应釜相关但可能也出现在其他化工场景 */
const EXTENDED_KEYWORDS: [string, number][] = [
  // 测控相关 — 权重 2
  ["温度测点", 2], ["压力控制", 2], ["搅拌转速", 2],
  ["冷却水", 2], ["夹套温度", 2], ["安全阀", 2], ["联锁", 2],
  // 化学相关 — 权重 2
  ["引发剂", 2], ["链转移", 2], ["分子量", 2], ["粘度", 2], ["转化率", 2],
  // 产品 — 权重 2
  ["PE聚合", 2], ["PP聚合", 2], ["PVC聚合", 2],
  // 设备类型 — 权重 2
  ["釜式反应器", 2], ["间歇反应", 2],
];

/** 边缘词：弱信号，可能与聚合反应釜有关但不一定 */
const EDGE_KEYWORDS: [string, number][] = [
  // 通用化工 — 权重 1
  ["化工设备", 1], ["反应器", 1], ["压力容器", 1],
  ["化工", 1], ["工艺参数", 1], ["操作工", 1],
  ["中控", 1], ["DCS", 1], ["巡检", 1],
  ["维护保养", 1], ["设备检修", 1], ["换热", 1],
];

/** 放行阈值：得分 >= 3 视为领域内 */
const PASS_THRESHOLD = 3;

/** 拒答模板 */
const REJECT_TEMPLATE = `抱歉，当前版本仅支持「聚合反应釜」相关问题的智能问答。
您的提问涉及{domain}领域，将在后续版本中逐步支持。如有反应釜相关问题，欢迎随时提问。`;

/**
 * 领域守卫 — 判断用户问题是否关于聚合反应釜
 *
 * ## 两步检测流程
 *
 * ### Step 1: 输入清洗
 * - 去除首尾空白
 * - 检查长度上限（2000 字符）
 * - 检测基础注入模式（尖括号标签、SQL 关键字 DROP/SELECT/INSERT）
 *
 * ### Step 2: 关键词匹配 + 计分
 * - 遍历三级关键词词典，每次命中累加对应权重
 * - 得分 >= PASS_THRESHOLD(3) → 放行
 * - 得分 < PASS_THRESHOLD(3) → 拒答，并尝试猜测用户领域
 *
 * ## 领域猜测（拒答时）
 * 使用简单规则匹配：命中"烹饪/菜/红烧/炒/煮/食材"→烹饪领域，
 * 命中"代码/编程/函数/bug/算法"→编程领域，
 * 否则→"其他"
 *
 * ## 未来扩展（注释说明）
 *
 * ### 灰度区 LLM 二次确认
 * 当得分为 2（接近阈值但不够），可能存在以下误判：
 * - 正例误拒："这个设备怎么维护"（没提到反应釜但确实在问它）
 * - 反例误放：需要引入 LLM 单次分类：
 *   system prompt: "判断以下问题是否与聚合反应釜设备的操作、维护、
 *                    监控或故障处理相关。仅回答 YES 或 NO。"
 *
 * ### 歧义检测
 * 当输入过于模糊时（如"那个温度怎么样了"），不直接拒答，
 * 而是返回澄清问题让用户补充信息。
 */
export function guard(message: string): GuardResult {
  // === Step 1: 清洗 ===
  const cleaned = message.trim();

  if (cleaned.length === 0) {
    return { passed: false, reason: "请输入您的问题" };
  }

  if (cleaned.length > 2000) {
    return { passed: false, reason: "问题内容过长，请精简至2000字以内" };
  }

  // 基础注入检测：拒绝包含 HTML 标签或 SQL 关键字的输入
  const injectionPatterns = [
    /<[^>]*>/g,                    // HTML 标签
    /\b(DROP|SELECT|INSERT|DELETE|UPDATE)\b.*\b(FROM|INTO|TABLE)\b/gi, // SQL 注入
    /<script[^>]*>/gi,             // XSS
  ];
  for (const pattern of injectionPatterns) {
    if (pattern.test(cleaned)) {
      return { passed: false, reason: "输入包含不合规内容" };
    }
  }

  // === Step 2: 关键词匹配 ===
  let score = 0;
  const allKeywords = [...CORE_KEYWORDS, ...EXTENDED_KEYWORDS, ...EDGE_KEYWORDS];

  for (const [keyword, weight] of allKeywords) {
    if (cleaned.includes(keyword)) {
      score += weight;
    }
  }

  if (score >= PASS_THRESHOLD) {
    return { passed: true };
  }

  // === 拒答 ===
  const guessedDomain = guessDomain(cleaned);
  const reason = REJECT_TEMPLATE.replace("{domain}", guessedDomain);

  return { passed: false, reason, guessedDomain };
}

/** 简单规则猜测用户领域 */
function guessDomain(message: string): string {
  const cookingWords = ["烹饪", "菜", "红烧", "炒", "煮", "食材", "做饭", "美食", "食谱"];
  const codeWords = ["代码", "编程", "函数", "bug", "算法", "程序", "Python", "Java", "JavaScript"];
  const financeWords = ["股票", "理财", "基金", "保险", "贷款"];

  for (const w of cookingWords) {
    if (message.includes(w)) return "烹饪";
  }
  for (const w of codeWords) {
    if (message.includes(w)) return "编程";
  }
  for (const w of financeWords) {
    if (message.includes(w)) return "金融";
  }
  return "其他";
}
```

## 验收标准

- [ ] 设备相关问题（含"反应釜""聚合釜""搅拌器"等）得分 >= 3 放行
- [ ] 非设备问题（烹饪、编程等）得分 < 3 拒答
- [ ] 拒答回复包含领域猜测和未来支持提示
- [ ] 空输入和超长输入被拦截
- [ ] XSS/SQL 注入模式被拦截
