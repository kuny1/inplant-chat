# T5.1 ChatBI 占位

**状态**：🔲 占位实现
**依赖**：T3.3（工具注册表）
**可并行**：是

## 产出文件

- `src/tools/chatbi.ts`

## 实现内容

```typescript
import { BaseTool } from "./registry.js";
import type { ToolResult } from "../types.js";

/**
 * ChatBI 工具 — 自然语言查询设备运行数据
 *
 * ## 设计意图
 * ChatBI（Chat Business Intelligence）让用户用自然语言查询结构化数据，
 * 而不需要写 SQL。这是工业智能问答的核心差异化能力之一。
 *
 * ## 核心链路
 * 1. 用户自然语言问题 → LLM 生成 SQL
 * 2. SQL 执行（数据库 / 模拟数据）
 * 3. 结果格式化（表格 / 文本描述）
 * 4. 可选：生成可视化图表（echarts 配置 JSON）
 *
 * ## Text-to-SQL 的 few-shot prompt 设计要点
 * - 提供 5-8 个 (问题, SQL) 示例，覆盖常见查询模式
 * - 示例需覆盖：单表查询、时间范围、聚合函数、多条件、排序
 * - Schema 信息注入 prompt：表名、字段名、字段含义、数据类型、示例值
 * - 常见陷阱的防御：
 *   - "平均温度"→ AVG(value) 非实时值
 *   - "最近一小时"→ 必须加时间窗口条件
 *   - "最高"→ MAX 而非 ORDER BY ... DESC LIMIT 1（性能差异）
 *
 * ## 与真实 DCS/SCADA 数据库的对接
 * OPC UA / Modbus ──→ TimescaleDB（时序数据库）
 *                    ├─ sensor_readings 表（测点ID, 值, 时间戳）
 *                    └─ alarm_events 表（报警ID, 类型, 时间戳, 确认状态）
 * ChatBI 工具 ──→ SQL 查询 TimescaleDB
 *
 * ## 自然语言到 SQL 的常见陷阱
 * - 聚合函数误用："平均温度" 可能被误解为 AVG(所有历史数据) 而非 AVG(最近N条)
 * - 时间窗口遗漏："现在的温度" 也需要加时间条件（最近 5 分钟内最新一条）
 * - 联表条件缺失：多表查询时 ON 条件容易被 LLM 遗漏
 * - NULL 处理：某些时间点无数据时的显示策略
 */

export class ChatBITool extends BaseTool {
  name = "chatbi_query";
  description =
    "用自然语言查询聚合反应釜的运行数据，支持统计分析。当用户询问历史趋势、" +
    "统计数据（平均值、最大值、最小值）、某时间段的运行情况时使用。";
  parameters = {
    type: "object",
    properties: {
      question: {
        type: "string",
        description: "用自然语言描述的查询需求，如「最近24小时T-101的平均温度」",
      },
      dataType: {
        type: "string",
        enum: ["sensor", "alarm", "task"],
        description: "查询的数据类型",
      },
    },
    required: ["question"],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const question = args.question as string;
    const dataType = (args.dataType as string) || "sensor";

    // 模拟生成的 SQL（展示 Text-to-SQL 的设计思路）
    const mockSQL = generateMockSQL(question, dataType);

    return {
      toolCallId: args._toolCallId as string ?? "",
      name: this.name,
      content: JSON.stringify({
        message:
          "ChatBI 模块将在后续版本上线，当前支持聚合反应釜的测点数据实时查询，" +
          "请使用 sensor_query 工具获取最新数据。对于统计类查询，请暂时参考以下模拟结果。",
        preview: {
          generatedSQL: mockSQL,
          note: "以上为 Text-to-SQL 功能的模拟预览。实际上线后将连接 TimescaleDB 执行真实查询。",
        },
        suggestion: "请使用 sensor_query 工具查看实时数据",
      }),
    };
  }
}

function generateMockSQL(question: string, dataType: string): string {
  if (dataType === "alarm") {
    return `-- 模拟 SQL：查询最近24小时报警统计
SELECT severity, COUNT(*) as count
FROM alarm_events
WHERE device_id = 'R-101'
  AND raised_at > NOW() - INTERVAL '24 hours'
GROUP BY severity
ORDER BY count DESC;`;
  }
  return `-- 模拟 SQL：查询T-101温度的历史趋势
SELECT timestamp, value
FROM sensor_readings
WHERE point_id = 'T-101'
  AND timestamp > NOW() - INTERVAL '1 hour'
ORDER BY timestamp DESC
LIMIT 100;`;
}
```

## 验收标准

- [ ] 工具可注册到 ToolRegistry
- [ ] 返回包含模拟 SQL 和引导提示
- [ ] 设计注释中 Text-to-SQL 链路和常见陷阱描述清晰
- [ ] 提示用户改用 sensor_query
