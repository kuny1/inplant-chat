import { BaseTool } from "./registry.js";
import type { Document } from "../rag/loader.js";
import type { LLMClient } from "../llm/client.js";
import { retrieve } from "../rag/retriever.js";
import type { ToolResult } from "../types.js";

/**
 * 知识检索工具 — RAG 检索聚合反应釜知识库
 *
 * ## LLM 调用场景
 * - 用户询问设备的结构、工作原理、参数规格
 * - 用户询问操作规范、安全注意事项
 * - 用户询问故障原因、排查方法、处理方案
 * - 回答需要引用文档来源作为依据
 *
 * ## 与 LLM 的交互模式
 * LLM 将用户问题提炼为查询关键词 → 工具执行语义搜索 → 返回相关文档块
 * → LLM 基于文档块生成回答并引用来源。
 *
 * ## EXTEND: 混合检索
 * 语义相似度 0.7 + BM25 关键词 0.3，弥补纯语义对精确术语的遗漏。
 */
export class KnowledgeTool extends BaseTool {
  name = "knowledge_query";
  description =
    "搜索聚合反应釜知识库。当用户询问设备结构、工作原理、操作规范、" +
    "工艺参数、安全事项、故障诊断、维护保养等问题时使用此工具。" +
    "返回最相关的文档段落及其来源。";
  parameters = {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "要检索的问题或关键词，用简练的语言描述需要查询的内容",
      },
      topK: {
        type: "number",
        description: "返回结果数量，默认为3，最多5条",
      },
    },
    required: ["question"],
  };

  constructor(
    private documents: Document[],
    private llm: LLMClient
  ) {
    super();
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const question = args.question as string;
    const topK = Math.min((args.topK as number) || 3, 5);

    const results = await retrieve(question, this.documents, this.llm, {
      topK,
    });

    const formatted = results.map((r) => ({
      content: r.chunk.content,
      source: r.document.title,
      relevance: Math.round(r.score * 100) / 100,
    }));

    return {
      toolCallId: (args._toolCallId as string) ?? "",
      name: this.name,
      content: JSON.stringify({
        chunks: formatted,
        totalFound: results.length,
      }),
    };
  }
}
