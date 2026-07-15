# T2.5 限流器 stub

**状态**：🔲 占位实现
**依赖**：无
**可并行**：是

## 产出文件

- `src/middleware/rate-limiter.ts`

## 实现要点

### 当前行为（MVP）

Fastify 插件，onRequest hook 中对 `/api/chat` 做简单 IP 计数：

```
每个 IP 维护 { count, resetAt }
每分钟（60s 窗口）内请求数超过 100 → 返回 HTTP 429
窗口到期后 count 自动重置
```

同时运行 `setInterval` 定时清理过期计数器，防止内存泄漏（Fastify onClose 时清理定时器）。

### 设计注释中描述的完整方案

**Token Bucket 算法**：

```
桶容量 = N（允许突发）
补充率 = R/分钟（长期平均速率上限）

请求到达 →
  计算自上次补充以来的应补令牌数: refill = elapsed * R / 60
  tokens = min(capacity, tokens + refill)
  if tokens > 0 → tokens -= 1, 放行
  else → 拒绝（返回 429）
```

相比当前固定窗口，Token Bucket 允许短时突发但严格限制平均速率，不会出现"窗口边界双倍流量"的漏洞。

**三级限流架构**：

| 级别 | 范围 | 速率 | 目的 |
|------|------|------|------|
| L1 | 全局 | 500 req/min | 防止整体过载 |
| L2 | 每用户/IP | 容量100, 恢复10/min | 防止单用户独占 |
| L3 | LLM Token | 按 token 消耗计数 | 成本控制 |

**Redis + Lua 原子操作**：

多进程/多实例部署时，用 Redis 存储桶状态，Lua 脚本保证"检查-扣减"的原子性。

伪代码：
```
redis.call('GET', key..':tokens')  → 当前令牌数
redis.call('GET', key..':last')    → 上次补充时间
计算应补令牌 → min(capacity, tokens + refill)
if tokens > 0 → DECR + SET last → return 1（放行）
else → return 0（限流）
```

### 设计决策

- **为什么用 fastify-plugin 包装？** Fastify 插件体系要求通过 `fp()` 注册，这样插件间可以共享作用域，且不会因为多次注册产生副作用
- **为什么限流只针对 `/api/chat`？** 静态文件和会话查询不消耗 LLM Token，无限流必要
- **为什么清理定时器频率是 60s？** 与计数窗口同频，保证过期数据最晚 60s 被回收

## 验收标准

- [x] Fastify 插件可注册，启动不报错
- [x] `/api/chat` 被限流，超限返回 429
- [x] 静态文件路由不限流
- [x] 定时器在服务关闭时清理
- [x] 设计注释包含 Token Bucket 算法说明 + Redis Lua 脚本
