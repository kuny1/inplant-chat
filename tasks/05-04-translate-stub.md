# T5.4 翻译助手占位

**状态**：🔲 占位实现
**依赖**：T3.3（工具注册表）, T2.1（LLM 客户端）
**可并行**：是

## 产出文件

- `src/tools/translate.ts`

## 实现内容

```typescript
import { BaseTool } from "./registry.js";
import type { LLMClient } from "../llm/client.js";
import type { ToolResult } from "../types.js";

/**
 * 翻译助手工具 — 化工专业领域翻译
 *
 * ## 设计意图
 * 工业场景中设备文档、操作手册、安全规程经常需要多语言版本。
 * 通用翻译工具无法正确处理化工专业术语（如 jacket=夹套而非夹克）。
 *
 * ## MVP 实现方式
 * 直接使用 LLM 进行翻译，配合化工专业 system prompt。
 * 适合术语量 < 100、翻译量不大的场景。
 *
 * ## 后续优化方向
 *
 * ### 1. 术语表注入
 * 将专业术语对照表注入 system prompt，保证翻译一致性：
 * ```typescript
 * const glossary = {
 *   "聚合反应釜": "Polymerization Reactor",
 *   "夹套": "Jacket",
 *   "搅拌器": "Agitator",
 *   "链转移": "Chain Transfer",
 * };
 * ```
 *
 * ### 2. 常用语料缓存
 * 相同输入直接返回缓存结果，减少 API 调用：
 * ```typescript
 * const cache = new Map<string, string>();
 * const key = hash(text + targetLang);
 * if (cache.has(key)) return cache.get(key);
 * ```
 *
 * ### 3. 支持语种
 * - 必须：中文 ↔ 英文（最常用）
 * - 常见：日文、德文（化工设备出口/进口主要语种）
 * - 未来：根据用户需求扩展
 *
 * ### 4. 质量评估
 * 对于重要文档的翻译，增加回译校验：
 * 原文 → 翻译 → 回译 → 与原文对比 → 差异 > 阈值 → 人工审核
 */

export class TranslateTool extends BaseTool {
  name = "translate";
  description =
    "将文本翻译为目标语言。支持中英文互译，适合化工设备文档、操作手册、安全规程的翻译。";
  parameters = {
    type: "object",
    properties: {
      text: {
        type: "string",
        description: "要翻译的文本",
      },
      targetLang: {
        type: "string",
        enum: ["en", "zh"],
        description: "目标语言：en=英文, zh=中文",
      },
    },
    required: ["text", "targetLang"],
  };

  private llm: LLMClient;

  constructor(llm: LLMClient) {
    super();
    this.llm = llm;
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const text = args.text as string;
    const targetLang = args.targetLang as string;

    const langName = targetLang === "en" ? "英文" : "中文";

    const systemPrompt =
      "你是一名专业的化工领域翻译专家。请将用户提供的文本翻译为指定语言。" +
      "翻译要求：1.保持专业术语的准确性（如 jacket=夹套，agitator=搅拌器）；" +
      "2.保持技术文档的正式语体；3.不添加原文没有的内容；" +
      "4.对不确定的术语翻译，在译文后以 [?] 标注。";

    try {
      const response = await this.llm.chat([
        { role: "system", content: systemPrompt },
        { role: "user", content: `请将以下内容翻译为${langName}：\n\n${text}` },
      ]);

      return {
        toolCallId: args._toolCallId as string ?? "",
        name: this.name,
        content: JSON.stringify({
          translation: response.content || "",
          sourceLang: targetLang === "en" ? "zh" : "en",
          targetLang,
          // EXTEND: 后续增加术语一致性检查、回译校验结果
        }),
      };
    } catch (error) {
      // 降级：翻译失败不影响主流程
      return {
        toolCallId: args._toolCallId as string ?? "",
        name: this.name,
        content: JSON.stringify({
          translation: "",
          error: "翻译服务暂不可用，请稍后重试",
          sourceLang: targetLang === "en" ? "zh" : "en",
          targetLang,
        }),
        error: error instanceof Error ? error.message : "翻译失败",
      };
    }
  }
}
```

## 验收标准

- [ ] 工具可注册到 ToolRegistry
- [ ] 能通过 LLM 实现中英文翻译
- [ ] 翻译失败时返回降级提示而不抛异常
- [ ] 设计注释中术语表、缓存、回译校验方案描述清晰
