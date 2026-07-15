import OpenAI from "openai";
import { config } from "../config.js";
import type { ToolDefinition } from "../types.js";

// ---- Error Types ----

export class LLMTimeoutError extends Error {
  constructor(message = "LLM API 请求超时") {
    super(message);
    this.name = "LLMTimeoutError";
  }
}

export class LLMAPIError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "LLMAPIError";
    this.statusCode = statusCode;
  }
}

// ---- LLM Client Interface ----

export interface AssistantMessage {
  content: string | null;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  tokensUsed: { input: number; output: number };
}

export interface ChatMessage {
  role: string;
  content: string;
  tool_call_id?: string;
  tool_calls?: unknown[];
}

export interface LLMClient {
  chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): Promise<AssistantMessage>;
  embed(texts: string[]): Promise<number[][]>;
}

// ---- DeepSeek Client ----

export class DeepSeekClient implements LLMClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseURL,
    });
  }

  async chat(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): Promise<AssistantMessage> {
    try {
      const response = await this.client.chat.completions.create({
        model: config.deepseek.model,
        messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
        tools: tools as OpenAI.Chat.ChatCompletionTool[],
        temperature: 0.3,
      });

      const choice = response.choices[0];
      if (!choice?.message) {
        throw new LLMAPIError(500, "LLM 返回空响应");
      }

      const message = choice.message;

      return {
        content: message.content,
        toolCalls: message.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })),
        tokensUsed: {
          input: response.usage?.prompt_tokens ?? 0,
          output: response.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error) {
      if (error instanceof LLMAPIError) throw error;

      if (error instanceof Error) {
        if (error.message.includes("timeout") || error.message.includes("ETIMEDOUT")) {
          throw new LLMTimeoutError();
        }
        // OpenAI SDK wraps API errors
        if ("status" in error) {
          const apiErr = error as { status: number; message: string };
          throw new LLMAPIError(apiErr.status, apiErr.message);
        }
      }
      throw new LLMAPIError(500, `LLM 调用异常: ${String(error)}`);
    }
  }

  async embed(texts: string[]): Promise<number[][]> {
    try {
      const response = await this.client.embeddings.create({
        model: config.deepseek.embeddingModel,
        input: texts,
      });

      return response.data.map((d) => d.embedding);
    } catch (error) {
      if (error instanceof Error && "status" in error) {
        const apiErr = error as { status: number; message: string };
        throw new LLMAPIError(apiErr.status, `Embedding 失败: ${apiErr.message}`);
      }
      throw new LLMAPIError(500, `Embedding 调用异常: ${String(error)}`);
    }
  }
}

// ---- Factory ----

let cachedClient: LLMClient | null = null;

/**
 * 创建 LLM 客户端实例（单例）
 *
 * EXTEND: 未来根据 config.modelProvider 切换实现：
 *   if (config.modelProvider === "qwen") return new QwenClient();
 *   return new DeepSeekClient();
 *
 * 调用方只依赖 LLMClient 接口，不感知具体实现。
 */
export function createLLMClient(): LLMClient {
  if (cachedClient) return cachedClient;

  if (!config.deepseek.apiKey) {
    throw new Error(
      "未配置 DEEPSEEK_API_KEY。\n" +
        "请在 .env 文件中设置：DEEPSEEK_API_KEY=sk-xxxx\n" +
        "获取 API Key: https://platform.deepseek.com/api_keys"
    );
  }

  cachedClient = new DeepSeekClient();
  return cachedClient;
}
