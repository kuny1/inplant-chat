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
