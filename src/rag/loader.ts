import { readFileSync, readdirSync } from "fs";
import { join, extname } from "path";

// ---- Types ----

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

// ---- Frontmatter Parser ----

/**
 * 解析 Markdown frontmatter
 * 格式:
 *   ---
 *   title: 文档标题
 *   category: 分类
 *   ---
 *   正文内容...
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
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      meta[key] = value;
    }
  }

  return { meta, body: match[2]! };
}

// ---- Chunk Splitter ----

/**
 * 按 Markdown 标题和段落分块
 *
 * 策略:
 * 1. 首先按 ## 二级标题切分，每块保持语义完整
 * 2. 如果某块超过 1000 字，按 \n\n 段落再次切分
 * 3. 合并时保证每块在 200-800 字之间
 * 4. 过滤掉 < 100 字符的无意义块（如纯标题行）
 */
function splitIntoChunks(documentId: string, content: string): Chunk[] {
  // Step 1: 按 ## 切分
  const sections = content.split(/\n(?=## )/);
  const chunks: Chunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed || trimmed.length < 100) continue;

    // Step 2: 大块按段落再次切分
    if (trimmed.length > 1000) {
      const paragraphs = trimmed.split(/\n\n/);
      let current = "";

      for (const para of paragraphs) {
        if (
          (current + para).length > 800 &&
          current.length > 200
        ) {
          chunks.push({
            id: `${documentId}-chunk-${chunkIndex++}`,
            documentId,
            content: current.trim(),
            index: chunks.length,
          });
          current = para;
        } else {
          current += (current ? "\n\n" : "") + para;
        }
      }

      if (current.trim().length >= 100) {
        chunks.push({
          id: `${documentId}-chunk-${chunkIndex++}`,
          documentId,
          content: current.trim(),
          index: chunks.length,
        });
      }
    } else {
      // Step 3: 小块直接保留
      chunks.push({
        id: `${documentId}-chunk-${chunkIndex++}`,
        documentId,
        content: trimmed,
        index: chunks.length,
      });
    }
  }

  return chunks;
}

// ---- Document Loader ----

/**
 * 加载 data/documents/ 下所有 .md 文件
 *
 * 流程:
 * 1. 遍历目录，过滤 .md 文件
 * 2. 逐文件读取并解析 frontmatter
 * 3. 按 ## 标题 + 段落分块
 * 4. 返回 Document[]，其中 chunk.embedding 暂为空，由 embedder 后续填充
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
