# T2.3 RAG 文档加载器

**状态**：✅ 完整实现
**依赖**：无
**可并行**：是

## 产出文件

- `src/rag/loader.ts`

## 实现内容

```typescript
import { readFileSync, readdirSync } from "fs";
import { join, extname } from "path";

export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  index: number;
  embedding?: number[]; // 由 embedder 后续填充
}

export interface Document {
  id: string;
  title: string;
  category: string;
  content: string;
  chunks: Chunk[];
}

/**
 * 从 Markdown 文本中解析 frontmatter
 * 格式：
 * ---
 * title: 文档标题
 * category: 分类
 * ---
 */
function parseFrontmatter(text: string): {
  meta: Record<string, string>;
  body: string;
} {
  const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: text };
  }
  const meta: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const [key, ...rest] = line.split(":");
    if (key && rest.length > 0) {
      meta[key.trim()] = rest.join(":").trim();
    }
  }
  return { meta, body: match[2]! };
}

/**
 * 按 Markdown 标题分块
 * 以 ## 二级标题为分割点，每块保持语义完整。
 * 如果某块超过 1000 字，按段落（\n\n）再次切分。
 * 过滤掉 < 100 字符的无意义块。
 */
function splitIntoChunks(documentId: string, content: string): Chunk[] {
  const sections = content.split(/\n(?=## )/);
  const chunks: Chunk[] = [];
  let index = 0;

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 100) continue;

    if (trimmed.length > 1000) {
      // 大块按段落再次切分
      const paragraphs = trimmed.split(/\n\n/);
      let currentChunk = "";
      for (const para of paragraphs) {
        if ((currentChunk + para).length > 800 && currentChunk.length > 200) {
          chunks.push({
            id: `${documentId}-chunk-${index++}`,
            documentId,
            content: currentChunk.trim(),
            index: chunks.length,
          });
          currentChunk = para;
        } else {
          currentChunk += (currentChunk ? "\n\n" : "") + para;
        }
      }
      if (currentChunk.trim().length >= 100) {
        chunks.push({
          id: `${documentId}-chunk-${index++}`,
          documentId,
          content: currentChunk.trim(),
          index: chunks.length,
        });
      }
    } else {
      chunks.push({
        id: `${documentId}-chunk-${index++}`,
        documentId,
        content: trimmed,
        index: chunks.length,
      });
    }
  }

  return chunks;
}

/**
 * 加载 data/documents/ 下所有 .md 文件
 * 1. 遍历目录读取 .md 文件
 * 2. 解析 frontmatter 提取 title, category
 * 3. 按 ## 标题分块
 * 4. 返回 Document[] 供 embedder 使用
 */
export function loadDocuments(dir: string): Document[] {
  const files = readdirSync(dir).filter((f) => extname(f) === ".md");
  const documents: Document[] = [];

  for (const file of files) {
    const raw = readFileSync(join(dir, file), "utf-8");
    const { meta, body } = parseFrontmatter(raw);

    const id = file.replace(/\.md$/, "");
    const doc: Document = {
      id,
      title: meta["title"] || file,
      category: meta["category"] || "未分类",
      content: body,
      chunks: [],
    };
    doc.chunks = splitIntoChunks(id, body);
    documents.push(doc);
  }

  return documents;
}
```

## 验收标准

- [ ] 能够正确加载 5 篇文档并解析 frontmatter
- [ ] 分块大小在 200-1000 字之间
- [ ] 每块保持语义完整（不在段落中间切断）
