# T5.2 报警助手占位

**状态**：🔲 占位实现
**依赖**：T3.3（工具注册表）
**可并行**：是

## 产出文件

- `src/tools/alarm.ts`

## 实现内容

```typescript
import { BaseTool } from "./registry.js";
import type { ToolResult } from "../types.js";

/**
 * 报警助手工具 — 查询和管理设备报警
 *
 * ## 设计意图
 * 报警是工业设备运营的核心场景。操作人员需要快速了解当前有哪些报警、
 * 严重程度如何、应该怎么处理。报警助手提供报警的生命周期管理。
 *
 * ## 报警生命周期
 *
 *   ┌─────────┐   操作员确认   ┌──────────────┐   问题解决   ┌──────────┐
 *   │ RAISED  │──────────────▶│ ACKNOWLEDGED │────────────▶│ RESOLVED │
 *   │ (触发)  │               │  (已确认)     │            │ (已解决)  │
 *   └─────────┘               └──────────────┘            └──────────┘
 *
 *   如果长时间未确认，自动升级：
 *     warning(黄) ──30min无响应──▶ critical(橙)
 *     critical(橙) ──10min无响应──▶ emergency(红) ──立即电话/短信通知
 *
 * ## 与 EAM/工单系统联动
 * alarm_acknowledge → 自动创建维修工单（调 task_create）
 * alarm_resolve → 自动关闭关联工单（调 task_update）
 * 如果工单创建失败 → Saga 回滚 alarm_acknowledge 为 unacknowledge
 *
 * ## Saga 补偿设计
 * alarm_acknowledge(alarmId) 的副作用：报警状态从 raised → acknowledged
 * 补偿操作 alarm_unacknowledge(alarmId)：报警状态回退到 raised
 *
 * 场景：用户说"确认这个报警并创建一个工单"
 *   Step 1: alarm_acknowledge("ALM-001") → 成功，状态变为 acknowledged
 *   Step 2: task_create(...) → 失败（网络错误，重试3次耗尽）
 *   Saga: 逆序补偿
 *     - Step 1 补偿: alarm_unacknowledge("ALM-001") → 状态回退 raised
 *   Plan 状态: ROLLED_BACK
 *
 * ## EXTEND: 对接真实报警系统
 * - SCADA 报警接口适配
 * - 报警升级策略配置化
 * - 报警统计与趋势分析（哪些报警最频繁？什么时间段？）
 */

export class AlarmTool extends BaseTool {
  name = "alarm_query";
  description =
    "查询聚合反应釜的报警信息。可查询当前活跃报警、历史报警记录，" +
    "按严重程度或时间段筛选。也可确认（acknowledge）报警。" +
    "当用户询问设备报警、异常情况时使用。";
  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["query", "acknowledge"],
        description: "操作类型：query=查询报警, acknowledge=确认报警",
      },
      status: {
        type: "string",
        enum: ["active", "acknowledged", "resolved"],
        description: "报警状态筛选",
      },
      severity: {
        type: "string",
        enum: ["warning", "critical", "emergency"],
        description: "严重程度筛选",
      },
      alarmId: {
        type: "string",
        description: "确认报警时提供报警ID",
      },
      operator: {
        type: "string",
        description: "确认操作人",
      },
    },
    required: ["action"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = args.action as string;

    if (action === "acknowledge") {
      return {
        toolCallId: args._toolCallId as string ?? "",
        name: this.name,
        content: JSON.stringify({
          success: true,
          message: `报警 ${args.alarmId || "未知"} 已由 ${args.operator || "操作员"} 确认`,
          note: "报警助手模块将在后续版本完整上线，当前为模拟确认结果",
          // EXTEND: 这里会返回真实的 alarm_acknowledge 结果，
          // 同时登记 Saga 日志用于可能的回滚
        }),
      };
    }

    // query — 模拟数据
    return {
      toolCallId: args._toolCallId as string ?? "",
      name: this.name,
      content: JSON.stringify({
        alarms: [
          {
            id: "ALM-001",
            device: "R-101",
            pointId: "T-101",
            type: "温度超高",
            severity: "critical",
            value: "185°C",
            limit: "160°C",
            status: "active",
            raisedAt: "2026-07-15T07:30:00Z",
            description: "釜内温度A超出正常范围上限160°C，当前185°C",
          },
          {
            id: "ALM-002",
            device: "R-101",
            pointId: "P-101",
            type: "压力偏高",
            severity: "warning",
            value: "0.52MPa",
            limit: "0.50MPa",
            status: "active",
            raisedAt: "2026-07-15T08:00:00Z",
            description: "釜内压力超出正常范围上限0.50MPa，当前0.52MPa",
          },
          {
            id: "ALM-003",
            device: "R-101",
            type: "搅拌电流过高",
            severity: "warning",
            value: "85A",
            limit: "75A",
            status: "acknowledged",
            raisedAt: "2026-07-14T22:00:00Z",
            acknowledgedBy: "张工",
            acknowledgedAt: "2026-07-14T22:15:00Z",
            description: "搅拌电机电流超过额定值，可能原因：物料粘度过高或机械故障",
          },
        ],
        note: "报警助手模块将在后续版本完整上线，以上为模拟数据展示设计思路。真实数据将对接 SCADA 系统。",
      }),
    };
  }
}
```

## 验收标准

- [ ] 工具可注册到 ToolRegistry
- [ ] query 返回模拟报警列表（含 active/acknowledged 两种状态）
- [ ] acknowledge 返回模拟确认结果
- [ ] 设计注释中报警生命周期和 Saga 补偿设计描述清晰
