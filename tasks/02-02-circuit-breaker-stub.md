# T2.2 熔断器 stub

**状态**：🔲 占位实现
**依赖**：无
**可并行**：是

## 产出文件

- `src/llm/circuit-breaker.ts`

## 实现要点

### 当前行为（MVP）

`CircuitBreaker.call(fn)` 直接执行 fn 并返回结果，不做任何熔断判断。类包含完整的状态管理字段（state、failures、lastFailureTime），但只在注释中体现逻辑。

### 设计注释中描述的核心算法

**三态状态机**：

```
CLOSED（正常）
  │ 连续失败次数 ≥ failureThreshold(5)
  ▼
OPEN（熔断，拒绝所有请求）
  │ 等待 recoveryTimeout(30s)
  ▼
HALF_OPEN（探测，允许少量请求试探）
  │ 试探成功 → CLOSED
  │ 试探失败 → OPEN
```

**集成方式**：装饰器模式

```
breaker.call(() => llmClient.chat(messages, tools))
```

LLMClient 不感知熔断，调用方通过 breaker 包装即可获得熔断保护。

### 生产就绪建议

- Node.js 生态推荐使用 `opossum` 库（成熟、经过大规模验证）
- 每个外部 API 独立断路器实例（DeepSeek 和 Qwen 分别熔断）
- 熔断时降级策略：自动切换到备用模型；无备用则返回友好错误

### 注释结构

文件中以 30+ 行注释覆盖：
1. 为什么需要熔断器（防级联故障、快速失败优于长时间等待）
2. ASCII 状态机图 + 参数建议
3. 装饰器模式集成示例
4. MVP→生产的关键变化
5. 降级策略（备用模型切换 / 友好报错）

## 验收标准

- [x] 类可实例化，`call()` 方法能正常执行传入的函数
- [x] 设计注释中状态机逻辑描述清晰
- [x] 注释中包含 opossum 库推荐
