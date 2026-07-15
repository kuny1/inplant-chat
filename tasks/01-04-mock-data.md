# T1.4 模拟数据准备

**状态**：✅ 完整实现
**依赖**：无
**可并行**：是

## 产出文件

- `data/documents/overview.md`
- `data/documents/structure.md`
- `data/documents/operation.md`
- `data/documents/safety.md`
- `data/documents/troubleshooting.md`
- `data/sensors.json`

## 实现内容

### 5 篇 Markdown 文档

每篇 500-800 字，真实工业风格，使用 `---frontmatter---` 声明元数据。

#### overview.md — 聚合反应釜概述

```markdown
---
title: 聚合反应釜概述
category: 基础知识
---

# 聚合反应釜概述

## 设备定义

聚合反应釜是用于高分子化合物聚合反应的核心设备...

## 主要应用

- 聚乙烯(PE)生产
- 聚丙烯(PP)生产
- 聚氯乙烯(PVC)生产

## 设备分类

按结构分：釜式、管式、塔式反应器。

## R-101 设备参数

| 参数 | 规格 |
|------|------|
| 容积 | 10m³ |
| 设计压力 | 1.0 MPa |
| 设计温度 | 200°C |
| 搅拌功率 | 55 kW |
| 换热面积 | 25 m² |
```

#### structure.md — 结构组成与工作原理

核心组件：釜体、搅拌器（锚式/桨式/涡轮式）、夹套/盘管换热系统、机械密封、进出料口、安全附件。自由基聚合反应流程。

#### operation.md — 操作规范与工艺参数

开车前检查清单、升温升压曲线、搅拌转速控制（200-800rpm）、降温程序、停车步骤、常见工艺配方示例。

#### safety.md — 安全规范与应急处置

超温超压保护（安全阀设定值）、联锁逻辑、紧急冷却系统、泄爆片、有毒有害物质防护、灭火方案。

#### troubleshooting.md — 常见故障诊断与处理

温度异常原因树（冷却水不足 → 搅拌失效 → 反应暴聚）、压力异常、搅拌电流过高、机械密封泄漏、出料困难。每故障含：现象、可能原因、排查步骤、处理措施。

### sensors.json — 10 个测点

```json
[
  {
    "id": "T-101",
    "name": "釜内温度A",
    "location": "R-101釜体上部",
    "unit": "°C",
    "normalRange": [120, 160],
    "currentValue": 155.2,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "T-102",
    "name": "釜内温度B",
    "location": "R-101釜体中部",
    "unit": "°C",
    "normalRange": [120, 160],
    "currentValue": 158.7,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "T-103",
    "name": "夹套进口温度",
    "location": "R-101夹套进口",
    "unit": "°C",
    "normalRange": [80, 120],
    "currentValue": 95.3,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "T-104",
    "name": "夹套出口温度",
    "location": "R-101夹套出口",
    "unit": "°C",
    "normalRange": [85, 125],
    "currentValue": 102.1,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "P-101",
    "name": "釜内压力",
    "location": "R-101釜顶",
    "unit": "MPa",
    "normalRange": [0.1, 0.5],
    "currentValue": 0.32,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "P-102",
    "name": "夹套压力",
    "location": "R-101夹套",
    "unit": "MPa",
    "normalRange": [0.2, 0.6],
    "currentValue": 0.45,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "L-101",
    "name": "釜内液位",
    "location": "R-101釜体",
    "unit": "%",
    "normalRange": [30, 85],
    "currentValue": 72.5,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "L-102",
    "name": "缓冲罐液位",
    "location": "V-101缓冲罐",
    "unit": "%",
    "normalRange": [20, 90],
    "currentValue": 55.0,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "F-101",
    "name": "冷却水流量",
    "location": "R-101夹套进口管",
    "unit": "L/min",
    "normalRange": [100, 300],
    "currentValue": 215.8,
    "updatedAt": "2026-07-15T08:00:00Z"
  },
  {
    "id": "V-101",
    "name": "搅拌转速",
    "location": "R-101搅拌电机",
    "unit": "rpm",
    "normalRange": [200, 800],
    "currentValue": 520,
    "updatedAt": "2026-07-15T08:00:00Z"
  }
]
```

## 验收标准

- [ ] 5 篇文档覆盖概述/结构/操作/安全/故障五大主题
- [ ] 文档含 frontmatter，可被 loader 解析
- [ ] sensors.json 包含 10 个测点，每种类型 2-4 个
- [ ] 数据真实感强，能支撑 3 个验证场景
