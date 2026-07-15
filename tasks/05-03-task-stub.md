# T5.3 任务助手占位

**状态**：🔲 占位实现
**依赖**：T3.3（工具注册表）
**可并行**：是

## 产出文件

- `src/tools/task.ts`

## 实现内容

```typescript
import { BaseTool } from "./registry.js";
import type { ToolResult } from "../types.js";

/**
 * 任务助手工具 — 管理设备维护和操作工单
 *
 * ## 设计意图
 * 工业设备维护需要工单系统来跟踪任务。任务助手提供工单的查询、创建、
 * 更新能力，并与报警系统联动。
 *
 * ## 工单状态机
 *
 *   ┌─────────┐   开始处理   ┌─────────────┐   完成       ┌───────────┐
 *   │ PENDING │─────────────▶│ IN_PROGRESS │────────────▶│ COMPLETED │
 *   │ (待处理) │             │  (进行中)    │            │  (已完成)   │
 *   └────┬────┘             └─────────────┘            └───────────┘
 *        │                                                    ▲
 *        │                    取消                            │
 *        └───────────────────────────────────────────────────▶│
 *                                                      ┌──────┴─────┐
 *                                                      │ CANCELLED  │
 *                                                      │  (已取消)   │
 *                                                      └────────────┘
 *
 * ## Saga 补偿设计
 * task_create → 补偿: task_delete(taskId)
 *   新创建的工单无历史依赖，直接删除即可
 *
 * task_update(taskId, newStatus) → 补偿: task_revert(taskId, oldStatus)
 *   回滚需要记录修改前的字段值（在 Saga 日志的 detail 中存储 update 前后的状态快照）
 *
 * 场景：用户说"创建一个工单然后确认报警"
 *   Step 1: task_create("维修T-101温度传感器", "P1") → 成功，id=WO-003
 *   Step 2: alarm_acknowledge("ALM-001") → 失败（网络错误，重试耗尽）
 *   Saga: 逆序补偿
 *     Step 1 补偿: task_delete("WO-003") → 删除成功
 *   Plan 状态: ROLLED_BACK
 *
 * ## 与真实工单系统对接
 * 采用适配器模式：
 *   interface TaskSystemAdapter {
 *     query(filter): Task[];
 *     create(task): Task;
 *     update(id, changes): Task;
 *   }
 * 通过依赖注入切换实现：内存 / REST API / 数据库直连。
 *
 * ## 优先级自动判定
 * 基于报警等级映射：emergency → P0, critical → P1, warning → P2
 * 无关联报警时默认为 P3
 */

export class TaskTool extends BaseTool {
  name = "task_query";
  description =
    "管理聚合反应釜的维护工单和操作任务。可查询、创建、更新工单状态。" +
    "当用户需要创建维修任务、查询工单进度、更新任务状态时使用。";
  parameters = {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["query", "create", "update"],
        description: "操作类型",
      },
      taskId: {
        type: "string",
        description: "工单ID（查询或更新时使用）",
      },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "completed", "cancelled"],
        description: "工单状态筛选或要更新的目标状态",
      },
      title: {
        type: "string",
        description: "工单标题（创建时使用）",
      },
      description: {
        type: "string",
        description: "工单详细描述",
      },
      priority: {
        type: "string",
        enum: ["P0", "P1", "P2", "P3"],
        description: "优先级：P0紧急/P1高/P2中/P3低",
      },
      assignee: {
        type: "string",
        description: "指派人",
      },
    },
    required: ["action"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const action = args.action as string;

    switch (action) {
      case "create":
        // 模拟创建工单
        // EXTEND: 真正的 create 会持久化工单并登记 Saga 日志（compensatingAction: delete）
        return {
          toolCallId: args._toolCallId as string ?? "",
          name: this.name,
          content: JSON.stringify({
            success: true,
            task: {
              id: "WO-" + Date.now().toString(36).toUpperCase(),
              title: args.title || "新建工单",
              status: "pending",
              priority: args.priority || "P2",
              assignee: args.assignee || "待分配",
              createdAt: new Date().toISOString(),
            },
            note: "任务助手模块将在后续版本完整上线，以上为模拟创建结果",
            // EXTEND: sagaLogEntry: { stepId, compensatingAction: "delete", taskId }
          }),
        };

      case "update":
        // EXTEND: 真正的 update 会记录变更前状态到 Saga 日志（compensatingAction: revert）
        return {
          toolCallId: args._toolCallId as string ?? "",
          name: this.name,
          content: JSON.stringify({
            success: true,
            taskId: args.taskId,
            updatedFields: { status: args.status },
            note: "任务助手模块将在后续版本完整上线，以上为模拟更新结果",
          }),
        };

      case "query":
      default:
        // 模拟工单列表
        return {
          toolCallId: args._toolCallId as string ?? "",
          name: this.name,
          content: JSON.stringify({
            tasks: [
              {
                id: "WO-001",
                title: "R-101温度测点T-101校验",
                description: "定期校验釜内温度传感器精度",
                status: "in_progress",
                priority: "P1",
                assignee: "张工",
                createdAt: "2026-07-14T09:00:00Z",
                relatedAlarm: "ALM-001",
              },
              {
                id: "WO-002",
                title: "R-101夹套清洗",
                description: "夹套结垢影响换热效率，需化学清洗",
                status: "pending",
                priority: "P2",
                assignee: "李工",
                createdAt: "2026-07-15T08:30:00Z",
              },
            ],
            note: "任务助手模块将在后续版本完整上线，以上为模拟数据展示设计思路",
          }),
        };
    }
  }
}
```

## 验收标准

- [ ] 工具可注册到 ToolRegistry
- [ ] query 返回模拟工单列表
- [ ] create 返回模拟创建结果含工单 ID
- [ ] update 返回模拟更新结果
- [ ] 设计注释中工单状态机、Saga 补偿、适配器模式描述清晰
