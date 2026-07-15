# T1.3 配置模块

**状态**：✅ 已完成
**依赖**：无
**可并行**：是

## 产出文件

- `src/config.ts`

## 实现要点

### 设计原则

- **单一出口**：全局只有一个 `config` 对象，其他模块不直接读 `process.env`
- **类型安全**：使用 `as const` 保证字面量类型推断
- **有罪推定**：API Key 为空字符串而非 undefined，首次调 API 时才报错（避免启动时就崩溃）

### 配置项分组

| 分组 | 字段 | 默认值 | 说明 |
|------|------|--------|------|
| deepseek | apiKey, baseURL, model, embeddingModel | `deepseek-chat` + `text-embedding-3-small` | LLM 和 Embedding 共用同一服务商 |
| agent | maxReActLoops, maxContextMessages | 5 / 10 | 控制 Agent 循环和上下文窗口 |
| knowledge | topK, similarityThreshold | 3 / 0.5 | RAG 检索参数 |

### 预留设计（注释形式）

- **qwen 配置块**：baseURL 指向阿里云 DashScope 兼容接口，model 默认为 `qwen-max`
- **modelProvider 切换**：通过环境变量 `MODEL_PROVIDER` 选择 `"deepseek"` 或 `"qwen"`，结合 LLMClient 接口实现热切换

### 环境变量缺失处理

API Key 缺失时不阻止启动（方便开发阶段先搭好框架），但在首次调用 `createLLMClient()` 时抛出明确错误，告知用户到 DeepSeek 平台获取 Key。

## 验收标准

- [x] 从 process.env 正确读取所有配置
- [x] 非必须环境变量有合理默认值
- [x] 预留的多模型配置以注释形式存在
