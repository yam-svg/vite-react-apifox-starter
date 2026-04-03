import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { loadApifoxConfig, projectRoot } from './apifox-config.mjs'

const defaultOutputPath = resolve(projectRoot, 'src/api/generated/apifox-openapi.json')

function normalizeSpec(payload) {
  if (payload && typeof payload === 'object') {
    if ('openapi' in payload || 'swagger' in payload) {
      return payload
    }

    const nestedData = payload.data
    if (nestedData && typeof nestedData === 'object') {
      if ('openapi' in nestedData || 'swagger' in nestedData || 'paths' in nestedData) {
        return nestedData
      }
    }
  }

  return payload
}

async function loadSpec(config) {
  const sourceUrl = String(config.openapiUrl ?? '').trim()
  const sourceFile = String(config.openapiFile ?? '').trim()
  const requestMethod = String(config.requestMethod ?? 'GET').trim().toUpperCase()

  if (sourceFile) {
    const raw = await readFile(resolve(projectRoot, sourceFile), 'utf8')
    return normalizeSpec(JSON.parse(raw.replace(/^\uFEFF/, '')))
  }

  if (!sourceUrl) {
    throw new Error(
      '请在 apifox.config.jsonc 中设置 openapiUrl 或 openapiFile，以便同步 Apifox 接口配置。',
    )
  }

  const headers = {}
  const token = String(config.token ?? '').trim()
  const authHeader = String(config.authHeader ?? '').trim()
  if (token) {
    headers.Authorization = authHeader || `Bearer ${token}`
  }

  if (config.headers && typeof config.headers === 'object') {
    Object.assign(headers, config.headers)
  }

  let body
  if (config.requestBody !== undefined && config.requestBody !== null && config.requestBody !== '') {
    body = typeof config.requestBody === 'string' ? config.requestBody : JSON.stringify(config.requestBody)
    if (!('Content-Type' in headers)) {
      headers['Content-Type'] = 'application/json'
    }
  }

  const response = await fetch(sourceUrl, {
    method: requestMethod,
    headers,
    body,
  })
  if (!response.ok) {
    throw new Error(`拉取 Apifox 接口配置失败：${response.status} ${response.statusText}`)
  }

  const text = await response.text()
  if (!text.trim()) {
    throw new Error(
      'Apifox 响应为空。请检查 apifox.config.jsonc 中的 openapiUrl 是否为可导出 OpenAPI 的地址，或改用 openapiFile。',
    )
  }

  const trimmedText = text.trimStart()
  if (trimmedText.startsWith('<')) {
    throw new Error(
      'Apifox 返回了 HTML，而不是 OpenAPI JSON。当前 URL 可能是项目页面，不是导出接口地址。',
    )
  }

  return normalizeSpec(JSON.parse(text.replace(/^\uFEFF/, '')))
}

async function main() {
  const config = await loadApifoxConfig()
  const outputPath = resolve(projectRoot, String(config.outputFile ?? defaultOutputPath))
  const spec = await loadSpec(config)
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(spec, null, 2)}\n`, 'utf8')
  console.log(`Apifox 接口配置已保存到 ${outputPath}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})


