/**
 * 防御式解析 AI 响应。
 *
 * 这个文件的每一行都建立在一个前提上：**用户填的模型名可能不是我们预期的那个**。
 * 火山方舟是 OpenAI 兼容网关，但"兼容"能覆盖的字段是有限的，而且换一个模型、
 * 换一次版本，图片落点就可能从 `data[0].url` 变成 `data[0].b64_json`。
 * 所以这里不写「按文档取 data[0].url」那种一击必中的取值，而是**在整棵响应树里
 * 找第一个像图片的东西** —— 这样多一种落点不需要改代码。
 *
 * 也不抛异常。解析不出来就返回 `null` 加一句人话，交给调用方决定是重试还是报错；
 * 这里抛出去只会让上层用一个 try/catch 把真正的原因盖掉。
 */

/** 遍历节点数上限。响应树正常只有几十个节点，这个上限只防病态输入。 */
const MAX_NODES = 4000
const MAX_DEPTH = 6

/**
 * 深度优先收集树里所有字符串，附带它们所在的键名。
 * 键名一起收是因为 `"url"` 这个键本身就是很强的信号 —— 见 pickImage。
 */
function collectStrings(root) {
  const out = []
  const stack = [{ node: root, depth: 0, key: '' }]
  let seen = 0

  while (stack.length) {
    const { node, depth, key } = stack.pop()
    if (++seen > MAX_NODES) break
    if (node == null) continue

    if (typeof node === 'string') {
      out.push({ key, value: node })
      continue
    }
    if (depth >= MAX_DEPTH) continue

    if (Array.isArray(node)) {
      for (let k = node.length - 1; k >= 0; k -= 1) stack.push({ node: node[k], depth: depth + 1, key })
    } else if (typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) stack.push({ node: v, depth: depth + 1, key: k })
    }
  }
  return out
}

const B64_RE = /^[A-Za-z0-9+/=\r\n\s]+$/

/**
 * 找响应里的图片。
 *
 * 返回 `{ kind: 'b64' | 'url', value }`，找不到返回 null。
 *
 * **优先 b64 不是因为快，是因为它没有 TTL。** `response_format: url` 给的是临时
 * 链接，我们当然可以立刻下载，但链接本身在日志里躺着、过一段时间就死，将来排查
 * 「这张图当时到底是什么样」会扑空。b64 拿到就是终态。
 */
export function parseImageResponse(json) {
  const found = collectStrings(json)

  for (const { value } of found) {
    const s = value.trim()
    if (!s.startsWith('data:image')) continue
    const comma = s.indexOf(',')
    if (comma < 0) continue
    const body = s.slice(comma + 1)
    if (body.length > 100) return { kind: 'b64', value: body }
  }

  for (const { key, value } of found) {
    const s = value.trim()
    const looksLikeB64 = s.length > 400 && B64_RE.test(s) && !s.startsWith('http')
    const keySaysImage = /b64|image_base64/i.test(key)
    if (looksLikeB64 && keySaysImage) return { kind: 'b64', value: s }
  }

  for (const { key, value } of found) {
    const s = value.trim()
    if (!/^https?:\/\//i.test(s)) continue
    // 带 url 字样的键优先。方舟的草稿图链接里通常也有对象存储的域名，
    // 但万一响应里同时有个 callback_url 之类的东西，键名能把它排除掉。
    if (/url|image|img/i.test(key)) return { kind: 'url', value: s }
  }

  for (const { value } of found) {
    const s = value.trim()
    if (/^https?:\/\//i.test(s)) return { kind: 'url', value: s }
  }

  return null
}

/**
 * 从 chat/completions 响应里取正文。
 *
 * `content` 在 OpenAI 兼容网关上有三种形态：纯字符串、分片数组
 * （`[{type:'text',text:'...'}, {type:'image_url',...}]`）、或者干脆是 null
 * 而正文在 `reasoning_content` 里。三种都认，而且只挑 text 分片 ——
 * 把 image_url 分片当正文拼进去，JSON 解析必挂。
 */
export function parseChatText(json) {
  const direct = json?.choices?.[0]?.message
  if (direct) {
    const fromContent = textOf(direct.content)
    if (fromContent) return fromContent
    if (typeof direct.reasoning_content === 'string' && direct.reasoning_content.trim()) {
      return direct.reasoning_content
    }
  }
  if (typeof json?.output_text === 'string') return json.output_text
  if (typeof json?.choices?.[0]?.text === 'string') return json.choices[0].text

  // 兜底：整棵树里最长的那个看着像 JSON 的字符串
  let best = ''
  for (const { value } of collectStrings(json)) {
    if (value.length > best.length && /polygon|mask/.test(value) && value.includes('{')) best = value
  }
  return best
}

function textOf(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((p) => p && (p.type === 'text' || typeof p.text === 'string'))
    .map((p) => p.text ?? '')
    .join('')
}

/**
 * 从一段可能夹带解释文字、代码围栏的文本里挖出第一个 JSON 对象。
 *
 * 用「配平花括号」而不是正则：正文里的 `"mask": ["..##", ...]` 本身带引号和方括号，
 * 正则数不清；而且 JSON 字符串里可以合法地出现 `}`，只有逐字符走一遍、
 * 记住自己在不在字符串里、有没有被转义，才数得对。
 */
export function firstJsonObject(text) {
  if (typeof text !== 'string') return null
  const trimmed = text.trim()
  if (!trimmed) return null

  try {
    const whole = JSON.parse(trimmed)
    if (whole && typeof whole === 'object') return whole
  } catch {
    /* 不是纯 JSON，继续往下挖 */
  }

  let from = 0
  let tried = 0
  while (tried < 50) {
    const start = trimmed.indexOf('{', from)
    if (start < 0) break
    from = start + 1
    tried += 1

    let depth = 0
    let inString = false
    let escaped = false
    for (let k = start; k < trimmed.length; k += 1) {
      const ch = trimmed[k]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') inString = true
      else if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          try {
            const obj = JSON.parse(trimmed.slice(start, k + 1))
            if (obj && typeof obj === 'object') return obj
          } catch {
            /* 这一对花括号里的不是 JSON，从下一个 { 重新找 */
          }
          break
        }
      }
    }
  }
  return null
}

const TRUE_CHARS = new Set(['#', '1', 'x', 'X', '真'])

/**
 * 归一化视觉响应的正文：多边形 + 掩码。
 *
 * **只归一化，不修正。** 掩码行数不对就如实记进 `problems`，不替 AI 补齐 ——
 * 补齐出来的掩码看着像模像样，但那是我们编的，不是它给的。调用方靠 `problems`
 * 判断该不该信这套掩码，或者干脆退到多边形那条路。
 */
export function parseOutlinePayload(obj, { cols, rows }) {
  const problems = []

  let polygon = []
  const rawPoly = obj?.polygon ?? obj?.outline ?? obj?.points
  if (Array.isArray(rawPoly)) {
    polygon = rawPoly
      .map((p) => (Array.isArray(p) ? [Number(p[0]), Number(p[1])] : null))
      .filter((p) => p && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    if (polygon.length !== rawPoly.length) {
      problems.push(`多边形里有 ${rawPoly.length - polygon.length} 个顶点不是数字对，已丢弃`)
    }
  } else if (rawPoly != null) {
    problems.push('polygon 字段不是数组')
  }

  let mask = null
  const rawMask = obj?.mask ?? obj?.grid
  if (typeof rawMask === 'string') {
    mask = normalizeMask(rawMask.split('\n'), { cols, rows, problems })
  } else if (Array.isArray(rawMask)) {
    // 也可能是 [['#','.'], ...] 或者 [[1,0], ...]
    mask = normalizeMask(
      rawMask.map((r) => (Array.isArray(r) ? r.map((c) => (c ? '#' : '.')).join('') : String(r))),
      { cols, rows, problems },
    )
  } else if (rawMask != null) {
    problems.push('mask 字段既不是字符串也不是数组')
  }

  return { polygon, mask, note: typeof obj?.note === 'string' ? obj.note : '', problems }
}

function normalizeMask(lines, { cols, rows, problems }) {
  let out = lines.map((line) =>
    String(line)
      .replace(/[\s|]/g, '')
      .split('')
      .map((ch) => (TRUE_CHARS.has(ch) ? '#' : '.'))
      .join(''),
  )
  out = out.filter((l) => l.length > 0)
  if (out.length === 0) return null

  const widthBad = out.filter((l) => l.length !== cols).length
  if (widthBad > 0) {
    problems.push(`掩码有 ${widthBad} 行的宽度不是 ${cols} 格，已按左边对齐截断/补空`)
  }
  out = out.map((l) => (l.length > cols ? l.slice(0, cols) : l.padEnd(cols, '.')))

  if (out.length > rows) {
    problems.push(`掩码有 ${out.length} 行，超过 ${rows} 行，多出来的已丢弃`)
    out = out.slice(0, rows)
  } else if (out.length < rows) {
    problems.push(`掩码只有 ${out.length} 行，少于 ${rows} 行，缺的按空行处理`)
    while (out.length < rows) out.push('.'.repeat(cols))
  }

  const filled = out.join('').split('').filter((c) => c === '#').length
  if (filled === 0) {
    problems.push('掩码里一个填充格都没有')
    return null
  }
  return out
}
