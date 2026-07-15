# T2.2 熔断器 stub

**状态**：🔲 占位实现
**依赖**：无
**可并行**：是

## 产出文件

- `src/llm/circuit-breaker.ts`

## 实现内容

完整实现一个 always-pass 的最小版本，带 30+ 行设计注释说明完整算法。

```typescript
/**
 * 熔断器 — MVP Stub 实现
 *
 * ## 为什么需要熔断器？
 * 当外部 API（DeepSeek/Qwen）不可用时，快速失败比长时间等待更有利于用户体验。
 * 熔断器防止级联故障——如果 API 已经连续失败，后续请求直接拒绝而不等待超时。
 *
 * ## 核心算法：三态状态机
 *
 *                    ┌──────────────────────────┐
 *                    │                          │
 *    连续失败≥阈值    ▼                          │
 *   ┌──────┐  failureThreshold=5  ┌──────┐     │
 *   │CLOSED│ ─────────────────────▶│ OPEN  │     │
 *   │(正常)│                      │(熔断) │     │
 *   └──┬───┘                      └───┬───┘     │
 *      │         探测成功              │         │
 *      │  ┌──────────────────────────┘         │
 *      ▼  │    recoveryTimeout=30s             │
 *   ┌──────┴───┐                               │
 *   │HALF_OPEN │                               │
 *   │ (探测)    │───────────────────────────────┘
 *   └──────────┘         探测失败
 *
 * 参数建议：
 * - failureThreshold = 5     // 连续失败 5 次触发熔断
 * - recoveryTimeout = 30000  // 30 秒后尝试恢复
 *
 * ## MVP → 生产的关键变化
 * - 当前：永远 CLOSED，所有请求直接放行
 * - 生产：每 LLM API 独立实例，基于状态机控制
 * - Node.js 生态建议用 opossum 库（https://github.com/nodeshift/opossum）
 *
 * ## 集成方式（装饰器模式，不侵入 LLMClient）
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 5, recoveryTimeout: 30000 });
 * const result = await breaker.call(() => llmClient.chat(messages, tools));
 * ```
 * LLM 客户端不感知熔断逻辑，调用方透明。
 *
 * ## 降级策略（熔断时）
 * - 如有备用模型（Qwen）：自动切换
 * - 如无备用模型：返回友好错误提示，不阻塞整个请求
 */

export class CircuitBreaker {
  private state: "CLOSED" | "OPEN" | "HALF_OPEN" = "CLOSED";
  private failures = 0;
  private readonly failureThreshold: number;
  private readonly recoveryTimeout: number;

  constructor(options: { failureThreshold?: number; recoveryTimeout?: number } = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.recoveryTimeout = options.recoveryTimeout ?? 30000;
  }

  /**
   * 执行受熔断器保护的异步操作
   *
   * MVP: 永远直接执行，不进行熔断判断。
   * EXTEND: 根据状态机决定是否执行或直接拒绝。
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    // MVP: 直接放行
    return fn();

    // EXTEND: 实现完整状态机
    // if (this.state === "OPEN") {
    //   if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
    //     this.state = "HALF_OPEN";
    //   } else {
    //     throw new Error("Circuit breaker is OPEN");
    //   }
    // }
    // try {
    //   const result = await fn();
    //   this.onSuccess();
    //   return result;
    // } catch (error) {
    //   this.onFailure();
    //   throw error;
    // }
  }

  private onSuccess(): void {
    // EXTEND: this.failures = 0; this.state = "CLOSED";
  }

  private onFailure(): void {
    // EXTEND: this.failures++; if (this.failures >= this.failureThreshold) this.state = "OPEN";
  }
}
```

## 验收标准

- [ ] 类可实例化，call() 方法能正常执行传入的函数
- [ ] 设计注释中状态机转换逻辑描述清晰
- [ ] 注释中包含生产环境建议（opossum 库引用）
