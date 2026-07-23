#!/usr/bin/env node
/* eslint-disable */
'use strict';
/**
 * 笔搭 MCP Server（只读）
 *
 * 暴露笔搭小说项目的数据为 MCP 工具，供 AI 客户端（Kilo Code / Cline / Continue 等）只读访问。
 * 通过 stdio 以 JSON-RPC 2.0 通信，实现 MCP 的 initialize / tools/list / tools/call。
 *
 * 设计原则：
 *  - 只读：绝不写入/删除文件，避免 AI 绕过"作者确认"直接改正文。
 *  - 纯 Node，无 vscode / 第三方依赖，可被任意 AI 客户端以 `node` 启动。
 *  - 项目根目录由环境变量 NOVEL_PROJECT_ROOT 或启动参数 --project 指定。
 *
 * 用法：node novel-mcp-server.js --project /path/to/novel-project
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml') || null;

// --- YAML 依赖兜底：若运行环境无 yaml 模块，则用极简 YAML 解析（仅取需要的标量） ---
let yamlParse;
try {
  const mod = require('yaml');
  yamlParse = (t) => mod.parse(t);
} catch {
  yamlParse = (t) => simpleYaml(t);
}

function simpleYaml(text) {
  // 极简解析：仅把顶层 key: value 与 key: [list] / 嵌套一层映射到对象。够用于 chapter.yaml/novel.yaml。
  const obj = {};
  let curListKey = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, '');
    if (!line || line.startsWith('#')) continue;
    if (/^\s+-\s+/.test(line) && curListKey) {
      const v = line.replace(/^\s*-\s+/, '').trim().replace(/^["']|["']$/g, '');
      if (Array.isArray(obj[curListKey])) obj[curListKey].push(v);
      continue;
    }
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim().replace(/^["']|["']$/g, '');
    if (val === '') {
      // 可能是列表或映射开头；按列表处理
      obj[key] = [];
      curListKey = key;
    } else {
      curListKey = null;
      obj[key] = val;
    }
  }
  return obj;
}

// --- 项目根定位 ---
function getProjectRoot() {
  const argv = process.argv.slice(2);
  let root = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' && argv[i + 1]) root = argv[++i];
  }
  if (!root) root = process.env.NOVEL_PROJECT_ROOT;
  if (!root) root = process.cwd();
  return path.resolve(root);
}

const ROOT = getProjectRoot();

function safeJoin(rel) {
  const full = path.resolve(ROOT, rel);
  const rel2 = path.relative(ROOT, full);
  if (rel2.startsWith('..') || path.isAbsolute(rel2)) {
    throw new Error('Path escapes project root: ' + rel);
  }
  return full;
}

function readText(rel) {
  const full = safeJoin(rel);
  try {
    if (fs.lstatSync(full).isSymbolicLink()) throw new Error('symlink not allowed');
  } catch (e) {
    throw e;
  }
  return fs.readFileSync(full, 'utf8').replace(/^\uFEFF/, '');
}

function tryRead(rel) {
  try {
    return readText(rel);
  } catch {
    return null;
  }
}

function readYaml(rel) {
  return yamlParse(readText(rel));
}

function listFiles(dir, pattern) {
  // 简单递归列出 dir 下匹配 pattern（**/*.md 等）的相对路径
  const results = [];
  const full = safeJoin(dir);
  if (!fs.existsSync(full)) return results;
  const walk = (d, base) => {
    for (const name of fs.readdirSync(d)) {
      const p = path.join(d, name);
      const st = fs.lstatSync(p);
      if (st.isSymbolicLink()) continue;
      const relBase = base ? base + '/' + name : name;
      if (st.isDirectory()) walk(p, relBase);
      else if (matchGlob(relBase, pattern)) results.push(path.join(dir, relBase).replace(/\\/g, '/'));
    }
  };
  walk(full, '');
  return results;
}

function matchGlob(name, pattern) {
  // 将 **/*.md 类模式转正则
  const re = new RegExp(
    '^' +
      pattern
        .replace(/\./g, '\\.')
        .replace(/\*\*/g, '<<<G>>>')
        .replace(/\*/g, '[^/]*')
        .replace(/<<<G>>>/g, '.*') +
      '$',
  );
  return re.test(name);
}

function extractFrontMatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { data: {}, body: text };
  return { data: yamlParse(m[1]), body: m[2] };
}

// --- 工具实现 ---
const TOOLS = [
  {
    name: 'get_novel_info',
    description: '获取小说项目基本信息（书名/作者/题材/卷/目标字数）。',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const y = readYaml('novel.yaml');
      return y;
    },
  },
  {
    name: 'list_chapters',
    description: '列出全部章节（id/标题/卷/章号/状态/字数）。',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const files = listFiles('chapters', '**/chapter.yaml');
      const out = [];
      for (const f of files) {
        try {
          const y = readYaml(f);
          if (y && y.id) {
            out.push({
              id: y.id,
              title: y.title || '',
              volume: y.volume || '',
              number: y.chapter_number,
              status: y.status || '',
              word_count: y.word_count || 0,
            });
          }
        } catch {}
      }
      out.sort((a, b) => a.number - b.number);
      return out;
    },
  },
  {
    name: 'get_chapter',
    description: '读取指定章节的正文 draft.md（不含 FrontMatter）与大纲。',
    inputSchema: {
      type: 'object',
      required: ['chapter_id'],
      properties: { chapter_id: { type: 'string', description: '章节 ID，如 ch001' } },
    },
    handler: async (args) => {
      const id = String(args.chapter_id || '');
      const dir = 'chapters/' + id;
      const draft = tryRead(dir + '/draft.md');
      const outline = tryRead(dir + '/outline.md');
      const meta = readYaml(dir + '/chapter.yaml');
      let body = draft || '';
      const m = body.match(/^---\s*\n[\s\S]*?\n---\s*\n?([\s\S]*)$/);
      if (m) body = m[1];
      return { meta, outline: outline || '', draft: body };
    },
  },
  {
    name: 'list_characters',
    description: '列出全部人物卡（id/姓名/角色/状态）。',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const files = listFiles('characters', '**/*.md');
      const out = [];
      for (const f of files) {
        try {
          const fm = extractFrontMatter(readText(f));
          if (fm.data && fm.data.id) {
            out.push({
              id: fm.data.id,
              name: fm.data.name || '',
              role: fm.data.role || '',
              status: fm.data.status || '',
              path: f.replace(/\\/g, '/'),
            });
          }
        } catch {}
      }
      return out;
    },
  },
  {
    name: 'get_character',
    description: '读取指定人物卡全文（人物路径或姓名）。',
    inputSchema: {
      type: 'object',
      required: ['id_or_name'],
      properties: { id_or_name: { type: 'string' } },
    },
    handler: async (args) => {
      const key = String(args.id_or_name || '');
      const files = listFiles('characters', '**/*.md');
      for (const f of files) {
        try {
          const fm = extractFrontMatter(readText(f));
          if (fm.data && (fm.data.id === key || fm.data.name === key)) {
            return { path: f, frontMatter: fm.data, body: fm.body };
          }
        } catch {}
      }
      throw new Error('Character not found: ' + key);
    },
  },
  {
    name: 'list_foreshadowing',
    description: '列出全部伏笔（名称/状态/重要度/埋设/回收章节）。',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const out = [];
      for (const sub of ['unresolved', 'resolved']) {
        const files = listFiles('foreshadowing/' + sub, '**/*.md');
        for (const f of files) {
          try {
            const fm = extractFrontMatter(readText(f));
            out.push({
              id: fm.data['编号'] || fm.data.id || '',
              name: fm.data['名称'] || fm.data.name || '',
              status: fm.data['状态'] || sub,
              importance: fm.data['重要程度'] || '',
              planted_chapter: fm.data['埋设章节'] || '',
              resolve_chapter: fm.data['回收章节'] || '',
              path: f.replace(/\\/g, '/'),
            });
          } catch {}
        }
      }
      return out;
    },
  },
  {
    name: 'get_timeline',
    description: '汇总各章节 story_time 构建的故事时间线。',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const files = listFiles('chapters', '**/chapter.yaml');
      const out = [];
      for (const f of files) {
        try {
          const y = readYaml(f);
          if (y && y.id && y.story_time) {
            out.push({
              chapter_id: y.id,
              title: y.title || '',
              story_time: y.story_time,
              characters: y.characters || [],
              location: y.location || [],
              climax: y.climax || '',
            });
          }
        } catch {}
      }
      out.sort((a, b) => 0);
      return out;
    },
  },
  {
    name: 'search_drafts',
    description: '在全部章节正文中搜索关键词，返回命中章节与行号。',
    inputSchema: {
      type: 'object',
      required: ['keyword'],
      properties: { keyword: { type: 'string' } },
    },
    handler: async (args) => {
      const kw = String(args.keyword || '');
      if (!kw) return [];
      const files = listFiles('chapters', '**/draft.md');
      const out = [];
      for (const f of files) {
        const text = tryRead(f);
        if (!text) continue;
        const lines = text.split(/\r?\n/);
        const hits = [];
        lines.forEach((l, i) => {
          if (l.includes(kw)) hits.push(i + 1);
        });
        if (hits.length) {
          const id = f.split('/')[1];
          out.push({ chapter_id: id, path: f, lines: hits });
        }
      }
      return out;
    },
  },
];

// --- JSON-RPC / MCP 协议 ---
const PROTOCOL_VERSION = '2024-11-05';

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

async function handle(req) {
  const { id, method, params } = req;
  try {
    if (method === 'initialize') {
      return result(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'novel-companion-mcp', version: '0.1.0' },
      });
    }
    if (method === 'notifications/initialized') return null;
    if (method === 'tools/list') {
      return result(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    }
    if (method === 'tools/call') {
      const name = params && params.name;
      const args = (params && params.arguments) || {};
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) throw new Error('Unknown tool: ' + name);
      const data = await tool.handler(args);
      return result(id, {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      });
    }
    return error(id, -32601, 'Method not found: ' + method);
  } catch (e) {
    return error(id, -32000, String(e && e.message ? e.message : e));
  }
}

function result(id, res) {
  return { jsonrpc: '2.0', id, result: res };
}
function error(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      continue;
    }
    handle(req).then((resp) => {
      if (resp) send(resp);
    });
  }
});

process.stdin.on('end', () => process.exit(0));
