import type { Source, ValidationResult } from "../types.js";

/**
 * 后验校验 — MVP Stub 实现
 *
 * ## 为什么需要后验校验？
 * LLM 的输出不是 100% 可靠的：可能产生幻觉（凭空编造数据）、
 * 可能被诱导输出危险建议、可能与检索到的文档矛盾。
 * 校验层在输出给用户之前做最后一道把关。
 *
 * ## 校验管线设计（两阶段）
 *
 * ### 阶段1: SafetyChecker（安全审查）
 * 目标: 确保输出不含有害、违规或严重误导内容
 *
 * 管线步骤:
 *   1. 敏感词正则扫描（硬编码词汇表）
 *   2. 如果命中 → unsafe + 记录命中词汇 + 触发重新生成
 *   3. 如果 clean → 可选 LLM 审查（低延迟小模型）:
 *      system: "检查文本是否包含危险操作建议、违法内容或严重误导。
 *               仅回答 SAFE 或 UNSAFE: [原因]"
 *   4. UNSAFE → 返回安全提示文本替代原始回答
 *
 * ### 阶段2: FactualityChecker（事实性校验）
 * 目标: 验证回答中的关键声明是否与检索到的来源一致
 *
 * 管线步骤:
 *   1. 提取关键声明（正则匹配: 数字范围、因果关系、操作步骤）
 *   2. 逐声明与 source texts 交叉验证（调 LLM）:
 *      system: "判断声明是否能被参考文本支持。
 *               声明: {claim}
 *               参考: {sourceText}
 *               仅回答: SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED"
 *   3. 每声明打分: SUPPORTED=1, PARTIAL=0.5, UNSUPPORTED=0
 *   4. confidence = mean(各声明得分)
 *   5. 如果 confidence < 0.7 → 追加不确定性声明:
 *      "⚠️ 以上部分信息未能充分验证，建议参考原始文档确认"
 *
 * ### 极端情况处理
 * - 回答为纯通用建议（如"注意安全"）→ 无可提取声明 → 跳过事实性校验
 * - 所有声明 UNSUPPORTED → confidence=0 → 标记严重警告
 * - sources 为空 → 跳过事实性校验（无对比基准），confidence 保持默认值
 *
 * ## 生产优化方向
 * - 用小模型（如 DeepSeek-lite）做校验，降低延迟和成本
 * - 校验结果记录到 Langfuse 等可观测平台，持续优化 prompt
 * - 安全词汇表维护为独立配置文件，支持运营人员无代码更新
 * - 声明提取考虑用简单 NER 模型替代正则（提高准确率）
 */
export async function validateResponse(
  _content: string,
  sources: Source[]
): Promise<ValidationResult> {
  // MVP: always-pass
  return {
    safe: true,
    factual: true,
    confidence: sources.length > 0 ? 1.0 : 1.0,
    warnings: [],
  };

  // EXTEND: 启用 SafetyChecker + FactualityChecker 管线
  //
  // // 1. 安全审查
  // const safetyResult = await checkSafety(content);
  // if (!safetyResult.safe) {
  //   return { safe: false, factual: false, confidence: 0,
  //            warnings: [safetyResult.reason] };
  // }
  //
  // // 2. 事实性校验（仅当有 sources 时）
  // if (sources.length === 0) {
  //   return { safe: true, factual: true, confidence: 1.0,
  //            warnings: ["无参考来源，未进行事实性校验"] };
  // }
  //
  // const claims = extractClaims(content);
  // const scores = await Promise.all(claims.map(c => verifyClaim(c, sources)));
  // const confidence = mean(scores);
  //
  // const warnings: string[] = [];
  // if (confidence < 0.7) {
  //   warnings.push("部分信息未能充分验证，建议参考原始文档确认");
  // }
  //
  // return { safe: true, factual: confidence >= 0.5,
  //          confidence, warnings };
}
