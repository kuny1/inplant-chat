# T2.5 限流器 stub

**状态**：🔲 占位实现
**依赖**：无
**可并行**：是

## 产出文件

- `src/middleware/rate-limiter.ts`

## 实现内容

Fastify 插件形式，当前用简单 Map 计数器，带完整 Token Bucket 设计注释。

```typescript
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fastifyPlugin from "fastify-plugin";

/**
 * 限流器 — MVP Stub 实现
 *
 * ## 为什么需要限流？
 * 企业多员工共用场景下，防止个别用户的大量请求耗尽 LLM API 的 Token 配额。
 * 当 API 有 QPM（Queries Per Minute）和 TPM（Tokens Per Minute）限制时尤为重要。
 *
 * ## Token Bucket 算法原理
 *
 * ┌─────────────────────────────────┐
 * │         令牌桶 (容量=N)          │
 * │  ┌───┬───┬───┬───┬───┬───┐    │
 * │  │ T │ T │ T │ T │   │   │    │ ← 当前有 4 个令牌
 * │  └───┴───┴───┴───┴───┴───┘    │
 * │                                 │
 * │  每 t 秒自动补充 R 个令牌 ──────▶│ ← refillRate
 * │  每个请求消耗 1 个令牌 ────────▶│
 * │  桶满时令牌不累积（防止突发过大）│
 * └─────────────────────────────────┘
 *
 * 三个关键参数：
 * - capacity (容量)：桶最多存储的令牌数，决定了允许的突发流量
 * - refillRate (填充率)：每秒/每分钟自动补充的令牌数，决定了长期平均速率
 * - burstSize = capacity：短时间内能处理的最大请求数
 *
 * 相比固定窗口计数器，Token Bucket 允许一定程度的突发，同时严格限制平均速率。
 *
 * ## 三级限流架构
 *
 * Level 1 — 全局：500 req/min
 *   保护整体系统不过载
 *
 * Level 2 — 用户：容量 100，恢复 10/min
 *   防止单用户独占配额。如果 10 个员工同时用，每人平均 10 req/min
 *
 * Level 3 — LLM Token：按 Token 消耗计数
 *   成本控制。如 DeepSeek 限制 500K TPM，超过则拒绝或排队
 *
 * ## MVP → 生产的关键变化
 *
 * 当前实现：简单 Map 计数器，每分钟重置，单进程有效
 *
 * 生产实现：
 * 1. Redis 存储桶状态（支持多进程/多实例）
 * 2. Lua 脚本保证原子操作：
 * ```lua
 * -- 原子化 Token Bucket 检查
 * local key = KEYS[1]
 * local capacity = tonumber(ARGV[1])
 * local refillRate = tonumber(ARGV[2])
 * local now = tonumber(ARGV[3])
 *
 * -- 计算需要补充的令牌数
 * local lastRefill = tonumber(redis.call('GET', key .. ':last') or now)
 * local tokens = tonumber(redis.call('GET', key .. ':tokens') or capacity)
 * local elapsed = now - lastRefill
 * local refill = math.floor(elapsed * refillRate / 60)
 * tokens = math.min(capacity, tokens + refill)
 *
 * if tokens > 0 then
 *   redis.call('SET', key .. ':tokens', tokens - 1)
 *   redis.call('SET', key .. ':last', now)
 *   return 1  -- 放行
 * end
 * return 0  -- 限流
 * ```
 * 3. 超限返回 HTTP 429 + Retry-After header
 * 4. 企业场景下的降级策略：超配额请求排队等待 vs 直接拒绝
 */

async function rateLimiterPlugin(fastify: FastifyInstance) {
  // MVP: 简单 IP 计数器，每分钟重置
  const counters = new Map<string, { count: number; resetAt: number }>();
  const MAX_PER_MINUTE = 100;
  const WINDOW_MS = 60_000;

  fastify.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    // 只对 /api/chat 限流
    if (!request.url.startsWith("/api/chat")) return;

    const key = request.ip;
    const now = Date.now();
    let entry = counters.get(key);

    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + WINDOW_MS };
      counters.set(key, entry);
    }

    entry.count++;

    if (entry.count > MAX_PER_MINUTE) {
      reply.code(429).send({
        error: "请求过于频繁，请稍后再试",
        retryAfter: Math.ceil((entry.resetAt - now) / 1000),
      });
    }

    // EXTEND: 替换为完整的 Token Bucket + Redis 方案
  });

  // 定期清理过期计数器，防止内存泄漏
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of counters) {
      if (now > entry.resetAt) counters.delete(key);
    }
  }, 60_000);
}

export default fastifyPlugin(rateLimiterPlugin, {
  name: "rate-limiter",
});
```

## 验收标准

- [ ] Fastify 插件可正常注册
- [ ] /api/chat 路径被限流计数
- [ ] 超限返回 429 状态码
- [ ] 设计注释中包含 Token Bucket 算法说明 + Redis Lua 脚本预览
