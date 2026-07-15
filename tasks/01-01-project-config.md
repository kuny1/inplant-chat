# T1.1 项目配置

**状态**：✅ 完整实现
**依赖**：无
**可并行**：是

## 产出文件

- `package.json`
- `tsconfig.json`
- `.env.example`

## 实现内容

### package.json

```json
{
  "name": "inplant-chat",
  "version": "0.1.0",
  "type": "module",
  "description": "仿 InPlant ChatBA 的智能问答 Agent，聚焦聚合反应釜设备",
  "scripts": {
    "dev": "tsx watch src/main.ts",
    "build": "tsc",
    "start": "node dist/main.js"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "@fastify/cors": "^10.0.0",
    "@fastify/static": "^8.0.0",
    "openai": "^4.70.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "@types/node": "^22.0.0"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### .env.example

```bash
# DeepSeek API
DEEPSEEK_API_KEY=sk-your-api-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-chat

# Server
PORT=3000

# --- 预留：未来多模型支持 ---
# QWEN_API_KEY=
# QWEN_BASE_URL=
# QWEN_MODEL=qwen-max
# MODEL_PROVIDER=deepseek
```

## 验收标准

- [x] `pnpm install` 成功安装所有依赖
- [x] `pnpm dev` 能启动（即使没有业务代码也应有 tsx 进程）
