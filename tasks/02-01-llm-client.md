# T2.1 LLM 客户端

**状态**：✅ 完整实现
**依赖**：无
**可并行**：是

## 产出文件

- `src/llm/client.ts`

## 实现内容

```typescript
import OpenAI from "openai";
import { config } from "../config.js";

/**
 * LLM 客户端抽象接口
 * 支持未来切换模型提供商（DeepSeek / Qwen / 其他兼容 OpenAI 的 API）
 */
export interface LLMClient {
  chat(
    messages: Array<{ role: string; content: string; tool_call_id?: string; tool_calls?: unknown[] }>,
    tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }>
  ): Promise<{
    content: string | null;
    toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
    tokensUsed: { input: number; output: number };
  }>;

  embed(texts: string[]): Promise<number[][]>;
}

/**
 * DeepSeek API 客户端
 * 使用 OpenAI 兼容 SDK，baseURL 指向 DeepSeek 服务
 */
export class DeepSeekClient implements LLMClient {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.deepseek.apiKey,
      baseURL: config.deepseek.baseURL,
    });
  }

  async chat(messages, tools?) {
    const response = await this.client.chat.completions.create({
      model: config.deepseek.model,
      messages: messages as OpenAI.Chat.ChatCompletionMessageParam[],
      tools: tools as OpenAI.Chat.ChatCompletionTool[],
      temperature: 0.3,
    });

    const choice = response.choices[0]!;
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
  }

  async embed(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: config.deepseek.embeddingModel,
      input: texts,
    });

    return response.data.map((d) => d.embedding);
  }
}

/**
 * 创建 LLM 客户端实例
 *
 * EXTEND: 未来根据 config.modelProvider 切换实现
 *   if (config.modelProvider === 'qwen') return new QwenClient();
 *   return new DeepSeekClient();
 *
 * 这样调用方只依赖 LLMClient 接口，无需感知具体实现。
 */
export function createLLMClient(): LLMClient {
  if (!config.deepseek.apiKey) {
    throw new Error(
      "未配置 DEEPSEEK_API_KEY，请在 .env 文件中设置。\n" +
      "获取 API Key: https://platform.deepseek.com/api_keys"
    );
  }
  return new DeepSeekClient();
}
```

## 错误处理

网络超时和 API 错误分别捕获，抛出明确类型的错误：

```typescript
class LLMTimeoutError extends Error { ... }
class LLMAPIError extends Error { statusCode: number; ... }
```

## 验收标准

- [ ] chat() 能正常调通 DeepSeek API
- [ ] embed() 返回正确维度的向量
- [ ] 无 API Key 时给出可操作的错误提示
- [ ] LLMClient 接口设计允许未来新增其他模型客户端
