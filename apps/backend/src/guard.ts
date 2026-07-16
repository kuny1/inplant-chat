import type { GuardResult } from "./types";

// ============================================================
// 领域关键词词典 — 三级权重
// ============================================================

/** 核心词（权重3）：直接指向聚合反应釜 */
const CORE_KEYWORDS: [string, number][] = [
  ["反应釜", 3], ["聚合釜", 3], ["聚合反应釜", 3],
  ["搅拌器", 3], ["夹套", 3], ["盘管", 3],
  ["聚合反应", 3], ["放热反应", 3], ["釜体", 3],
  ["高分子", 3], ["自由基聚合", 3], ["悬浮聚合", 3], ["乳液聚合", 3],
];

/** 扩展词（权重2）：反应釜相关但可能出现在其他化工场景 */
const EXTENDED_KEYWORDS: [string, number][] = [
  ["温度测点", 2], ["压力控制", 2], ["搅拌转速", 2],
  ["冷却水", 2], ["夹套温度", 2], ["安全阀", 2], ["联锁", 2],
  ["引发剂", 2], ["链转移", 2], ["分子量", 2], ["粘度", 2], ["转化率", 2],
  ["PE聚合", 2], ["PP聚合", 2], ["PVC聚合", 2],
  ["釜式反应器", 2], ["间歇反应", 2],
];

/** 边缘词（权重1）：弱信号，可能与反应釜有关 */
const EDGE_KEYWORDS: [string, number][] = [
  ["化工设备", 1], ["反应器", 1], ["压力容器", 1],
  ["化工", 1], ["工艺参数", 1], ["操作工", 1],
  ["中控", 1], ["DCS", 1], ["巡检", 1],
  ["维护保养", 1], ["设备检修", 1], ["换热", 1],
];

const ALL_KEYWORDS = [...CORE_KEYWORDS, ...EXTENDED_KEYWORDS, ...EDGE_KEYWORDS];

/** 放行阈值 */
export const PASS_THRESHOLD = 3;

/** 拒答模板 */
const REJECT_TEMPLATE =
  "抱歉，当前版本仅支持「聚合反应釜」相关问题的智能问答。" +
  "您的提问涉及{domain}领域，将在后续版本中逐步支持。" +
  "如有反应釜相关问题，欢迎随时提问。";

// ============================================================
// 关键词打分（纯函数，不含注入检测与会话上下文判断）
// ============================================================

/**
 * 对单条消息做关键词打分。
 *
 * 供两处使用：
 * 1. guard() — 当前消息的关键词匹配
 * 2. 会话上下文判断 — 遍历历史消息，确认是否为已建立的反应釜对话
 */
export function scoreKeywords(message: string): number {
  const cleaned = message.trim();
  let score = 0;

  for (const [keyword, weight] of ALL_KEYWORDS) {
    if (cleaned.includes(keyword)) {
      score += weight;
    }
  }

  return score;
}

// ============================================================
// 领域守卫
// ============================================================

/**
 * 领域守卫 — 判断用户问题是否关于聚合反应釜
 *
 * ## 三步检测流程
 *
 * ### Step 1: 输入清洗
 * - trim + 长度上限 2000 字
 * - 基础注入检测: HTML 标签 / XSS / SQL 关键字（DROP/SELECT/INSERT/DELETE/UPDATE）
 *
 * ### Step 2: 关键词匹配 + 计分
 * - 遍历三级关键词词典，每次命中累加权重
 * - 得分 >= PASS_THRESHOLD(3) → 放行
 * - 得分 < PASS_THRESHOLD(3) → 进入 Step 3
 *
 * ### Step 3: 会话上下文判断
 * - 如果当前消息得分不足，但会话中已有反应釜相关历史消息
 *   （即 isOngoingReactorSession = true），则视为追问 → 放行
 * - 否则 → 拒答 + 猜测用户领域
 *
 * ## 领域猜测
 * 拒答时用简单规则匹配关键词: 烹饪/代码/金融 → 对应领域，否则 → "其他"
 *
 * ## 未来扩展（注释预留）
 *
 * ### 灰度区 LLM 二次确认
 * 得分在 2（接近阈值但不够）时，可能存在误判:
 * - 正例误拒: "这个设备怎么维护"（没提反应釜但实际在问它）
 * - 引入 LLM 单次分类:
 *   system: "判断以下问题是否与聚合反应釜设备的操作、维护、
 *            监控或故障处理相关。仅回答 YES 或 NO。"
 *
 * ### 歧义检测
 * 当输入过于模糊（如"那个温度怎么样了"），不直接拒答，
 * 返回澄清问题让用户补充信息（"请说明是哪个设备、哪个测点"）。
 */
export function guard(
  message: string,
  context?: { isOngoingReactorSession: boolean }
): GuardResult {
  // === Step 1: 清洗 ===
  const cleaned = message.trim();

  if (cleaned.length === 0) {
    return { passed: false, reason: "请输入您的问题" };
  }

  if (cleaned.length > 2000) {
    return { passed: false, reason: "问题内容过长，请精简至2000字以内" };
  }

  // 基础注入检测
  const injectionPatterns = [
    /<[^>]*>/g,
    /\b(DROP|SELECT|INSERT|DELETE|UPDATE)\b.*\b(FROM|INTO|TABLE)\b/gi,
    /<script[^>]*>/gi,
  ];
  for (const pattern of injectionPatterns) {
    if (pattern.test(cleaned)) {
      return { passed: false, reason: "输入包含不合规内容" };
    }
  }

  // === Step 2: 关键词匹配 ===
  if (scoreKeywords(cleaned) >= PASS_THRESHOLD) {
    return { passed: true };
  }

  // === Step 3: 会话上下文 — 追问（追问句中无关键词但属于已建立的反应釜对话） ===
  if (context?.isOngoingReactorSession) {
    return { passed: true };
  }

  // === 拒答 ===
  const guessedDomain = guessDomain(cleaned);
  const reason = REJECT_TEMPLATE.replace("{domain}", guessedDomain);

  return { passed: false, reason, guessedDomain };
}

// ============================================================
// 领域猜测
// ============================================================

function guessDomain(message: string): string {
  const domainPatterns: [string[], string][] = [
    [["烹饪", "菜", "红烧", "炒", "煮", "食材", "做饭", "美食", "食谱"], "烹饪"],
    [["代码", "编程", "函数", "bug", "算法", "程序", "Python", "Java", "JavaScript"], "编程"],
    [["股票", "理财", "基金", "保险", "贷款", "投资"], "金融"],
  ];

  for (const [keywords, domain] of domainPatterns) {
    if (keywords.some((w) => message.includes(w))) {
      return domain;
    }
  }

  return "其他";
}
