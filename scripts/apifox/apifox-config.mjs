import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const jsoncConfigPath = resolve(projectRoot, 'apifox.config.jsonc')

function stripJsonComments(input) {
  let result = ''
  let inString = false
  let inLineComment = false
  let inBlockComment = false
  let quote = ''
  let escaped = false

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i]
    const next = input[i + 1]

    if (inLineComment) {
      if (char === '\n' || char === '\r') {
        inLineComment = false
        result += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i += 1
      }
      continue
    }

    if (inString) {
      result += char
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        inString = false
        quote = ''
      }
      continue
    }

    if (char === '"' || char === "'") {
      inString = true
      quote = char
      result += char
      continue
    }

    if (char === '/' && next === '/') {
      inLineComment = true
      i += 1
      continue
    }

    if (char === '/' && next === '*') {
      inBlockComment = true
      i += 1
      continue
    }

    result += char
  }

  return result
}

export async function loadApifoxConfig() {
  const raw = await readFile(jsoncConfigPath, 'utf8')

  const config = JSON.parse(stripJsonComments(raw.replace(/^\uFEFF/, '')))

  if (!config || typeof config !== 'object') {
    throw new Error(`Apifox 配置文件格式错误：${jsoncConfigPath}`)
  }

  return config
}


