# T1.5 前端 UI

**状态**：✅ 完整实现
**依赖**：无
**可并行**：是

## 产出文件

- `frontend/index.html`（单文件，内联 CSS + JS）

## 实现内容

### 视觉设计

- **配色**：工业风格 — 深蓝灰背景(#1a1d23)、卡片(#262a33)、强调色(#4fc3f7)、警告(#ff9800)、异常(#f44336)
- **布局**：两栏 — 左侧会话列表(240px) + 右侧聊天区(flex:1) + 底部输入框(fixed)

### 消息类型渲染

1. **用户消息**：右对齐气泡，蓝底(#2563eb)
2. **Agent 步骤**：左侧状态条，带颜色指示
   - 黄色脉冲 `running` → 绿色 `completed`
   - 红色 `error`
3. **Agent 回答**：左对齐气泡 + 底部来源引用卡片
4. **拒答消息**：橙色边框卡片，显示拒答原因

### JS 核心逻辑

```javascript
// SSE 接收
async function sendMessage(message) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, stream: true })
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const text = decoder.decode(value);
    // 解析 SSE 事件
    // event: step → 更新步骤条
    // event: content → 追加文字
    // event: done → 显示来源
  }
}

// 快捷键：Enter 发送，Shift+Enter 换行
// 自动滚动到底部
```

### 交互细节

- 发送中禁用输入框
- 步骤条展开/折叠思考过程
- 来源卡片可点击展开原文
- 新建会话按钮（清空当前会话）

## 验收标准

- [ ] 单文件可直接在浏览器打开（通过后端 serve 也能正常访问）
- [ ] 支持 SSE 流式渲染
- [ ] 步骤状态实时更新（running → completed）
- [ ] 移动端基本可用
