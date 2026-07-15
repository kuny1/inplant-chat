# T3.5 测点查询工具

**状态**：✅ 已完成
**依赖**：T1.4（sensors.json）, T3.3（工具注册表）
**可并行**：是（不依赖 Phase 3 其他任务）

## 产出文件

- `src/tools/sensor.ts`

## 实现要点

### 工具元数据

```
name: "sensor_query"
description: 告知 LLM 在用户询问温度、压力、液位、流量、转速等实时数据时调用
parameters:
  pointId: string  (可选) — 测点编号，如 T-101
  location: string (可选) — 位置关键词，如 釜体、夹套
  all: boolean     (可选) — 是否返回全部测点
```

三个过滤条件是 OR 关系：pointId 匹配 OR location 匹配 OR 全返回。

### 数据加载

构造时从 `data/sensors.json` 读取并解析，缓存到实例字段 `sensorData`。不每次读文件，减少 I/O。当前模拟静态数据，未来对接 OPC UA / Modbus → TimescaleDB 后，这里改为查询数据库。

### 状态自动判断

```
for each sensor:
  [min, max] = normalRange
  if currentValue > max:
    status = "critical"
    message = "⚠️ 当前值超出正常范围上限，偏差 +X"
  else if currentValue < min:
    status = "warning"
    message = "⚠️ 当前值低于正常范围下限，偏差 -X"
  else:
    status = "normal"
    message = "正常"
```

判断结果直接体现在返回数据中，LLM 拿到后不需要自己再算一遍，可以直接引用 message 文本。

### 返回结构

```
{
  points: [{
    id, name, location, value, unit,
    normalRange: [min, max],
    status: "normal" | "warning" | "critical",
    message: "正常" | "⚠️ 超出...",
    updatedAt
  }],
  total: N
}
```

每个测点 9 个字段，覆盖标识（id/name/location）、数据（value/unit/range）、判断（status/message）和时间戳。这个粒度让 LLM 有足够信息做综合分析。

### 设计决策

- **为什么传感器数据放在 JSON 文件而不是硬编码在代码里？** 数据和逻辑分离，方便替换为真实数据源。`data/sensors.json` 可以被外部脚本更新（模拟 DCS 数据刷新），工具代码不变
- **为什么 status 判断放在工具里而非 LLM 侧？** 确定性计算（数值范围比较）放在代码里更可靠，LLM 做数值判断可能出错。让 LLM 专注于理解和推理，工具负责数据层面的判断

## 验收标准

- [x] 支持按 pointId、location 过滤
- [x] 自动判断测点状态（normal/warning/critical）
- [x] 异常状态输出中文提示信息
- [x] 数据启动时加载到内存
