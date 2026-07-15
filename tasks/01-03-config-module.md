# T1.3 配置模块

**状态**：✅ 完整实现
**依赖**：无
**可并行**：是

## 产出文件

- `src/config.ts`

## 实现内容

```typescript
/**
 * 统一配置模块
 * 从环境变量读取所有配置，集中管理，提供类型安全的访问。
 */

export const config = {
  /** 服务端口 */
  port: parseInt(process.env.PORT || "3000", 10),

  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
    /** DeepSeek 兼容 OpenAI embedding 接口 */
    embeddingModel: "text-embedding-3-small",
  },

  // 预留：未来支持多模型切换
  // qwen: {
  //   apiKey: process.env.QWEN_API_KEY || "",
  //   baseURL: process.env.QWEN_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
  //   model: process.env.QWEN_MODEL || "qwen-max",
  // },
  // modelProvider: (process.env.MODEL_PROVIDER as "deepseek" | "qwen") || "deepseek",

  agent: {
    /** ReAct 最大循环轮数 */
    maxReActLoops: 5,
    /** 上下文中保留的最大消息数（超出触发压缩） */
    maxContextMessages: 10,
  },

  knowledge: {
    /** 默认检索结果数量 */
    topK: 3,
    /** 最低相似度阈值，低于此值的结果被过滤 */
    similarityThreshold: 0.5,
  },
} as const;
```

## 设计说明

- `as const` 保证配置值的字面量类型推断
- 所有可配置项集中在一个对象，方便排查和修改
- 预留配置以注释形式保留，不引入实际环境变量依赖

## 验收标准

- [ ] 启动时可正确读取环境变量
- [ ] 缺失非必须环境变量时有合理默认值
- [ ] 缺失 DEEPSEEK_API_KEY 时在调用 LLM 时给出明确错误提示（不是启动时 crash）
