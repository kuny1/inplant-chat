# T2.1 LLM 客户端

**状态**：✅ 已完成
**依赖**：无
**可并行**：是

## 产出文件

- `src/llm/client.ts`

## 实现要点

### 接口抽象

定义 `LLMClient` 接口，包含两个方法：

```
interface LLMClient {
  chat(messages, tools?) → AssistantMessage   // 对话补全，支持 function calling
  embed(texts[]) → number[][]                 // 文本向量化
}
```

方法签名与 OpenAI / DeepSeek API 对齐，但不绑定具体服务商。未来新增 Qwen 等模型只需新增实现类，调用方无需改动。

### DeepSeekClient 实现

- 使用 `openai` SDK，通过 baseURL 指向 DeepSeek 服务（`https://api.deepseek.com`）
- `chat()` 流程：构建请求 → `client.chat.completions.create()` → 解析 `choices[0].message` → 提取 content + tool_calls → 返回 `AssistantMessage`
- `embed()` 流程：`client.embeddings.create()` → 映射 `data[].embedding`
- temperature 固定 0.3，保证回答稳定性

### 错误处理

定义两个自定义错误类型：

- `LLMTimeoutError`：网络超时场景（检测 `ETIMEDOUT` 或 timeout 关键词）
- `LLMAPIError`：API 返回错误，携带 HTTP 状态码

异常不向上抛原始错误，统一包装为上述类型，方便调用方按类型做降级/重试决策。

### 单例工厂

`createLLMClient()` 函数：

- 首次调用时创建 `DeepSeekClient` 实例并缓存
- 检查 `DEEPSEEK_API_KEY` 是否存在，缺失时抛出可操作的错误提示（含获取 Key 的链接）
- 预留注释：未来根据 `config.modelProvider` 切换 `QwenClient`

### 关键设计决策

- **为什么用 OpenAI SDK 而非直接 fetch？** DeepSeek API 与 OpenAI 接口兼容，用 SDK 可以复用其错误处理、重试、流式等能力，减少重复造轮子
- **为什么 chat 和 embed 合并在一个接口？** 两者都依赖同一 API Key 和 baseURL，放在一起减少配置冗余；未来如需分离（如 embedding 走本地模型），可将接口拆分为 `ChatClient` + `EmbeddingClient`

## 验收标准

- [x] `LLMClient` 接口支持未来新增模型实现
- [x] `chat()` 正确解析 tool_calls
- [x] `embed()` 返回 1536 维向量
- [x] 无 API Key 时给出可操作的错误提示
- [x] 自定义错误类型区分超时和 API 错误
