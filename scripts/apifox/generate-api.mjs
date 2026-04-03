import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadApifoxConfig } from './apifox-config.mjs'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(import.meta.url)
const openapiPackageRoot = dirname(dirname(require.resolve('openapi-typescript')))
const generatedDir = resolve(projectRoot, 'src/api/generated')
const schemaPath = resolve(generatedDir, 'schema.ts')
const typesPath = resolve(generatedDir, 'types.ts')
const clientPath = resolve(generatedDir, 'client.ts')
const hooksPath = resolve(generatedDir, 'hooks.ts')
const indexPath = resolve(generatedDir, 'index.ts')

const queryMethods = new Set(['get', 'head', 'options'])
const mutationMethods = new Set(['post', 'put', 'patch', 'delete'])

function ensureTrailingNewline(text) {
  return text.endsWith('\n') ? text : `${ text }\n`
}

function toPascalCase(value) {
  return value
    .replace(/(^|[^a-zA-Z0-9]+)([a-zA-Z0-9])/g, (_, __, char) => char.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '')
}

function toCamelCase(value) {
  const pascal = toPascalCase(value)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

function sanitizeIdentifier(value, fallback = 'operation') {
  const cleaned = value.replace(/[^a-zA-Z0-9_$]+/g, '_').replace(/^([0-9])/, '_$1')
  return cleaned || fallback
}

function toTypePropertyKey(key) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key)
}

function pickOperationName(method, path, operation, usedNames) {
  const rawName = operation.operationId?.trim() || `${ method }_${ path }`
  const baseName = sanitizeIdentifier(toCamelCase(rawName), `${ method }Operation`)
  let candidate = baseName
  let index = 2
  while (usedNames.has(candidate)) {
    candidate = `${ baseName }${ index }`
    index += 1
  }
  usedNames.add(candidate)
  return candidate
}

function buildOperationDoc(operation) {
  return (operation.summary || operation.description || operation.operationId || '').trim()
}

function buildDocComment(text, indent = '') {
  if (!text) {
    return []
  }

  const normalized = text.replace(/\*\//g, '*\\/')

  return [
    `${indent}/**`,
    ...normalized.split('\n').map((line) => `${indent} * ${line}`),
    `${indent} */`,
  ]
}

function resolveRef(spec, ref) {
  if (!ref.startsWith('#/')) {
    return undefined
  }

  return ref.slice(2).split('/').reduce((current, segment) => {
    if (current && typeof current === 'object') {
      return current[segment]
    }
    return undefined
  }, spec)
}

function getSchemaFromContent(spec, content) {
  if (!content || typeof content !== 'object') {
    return undefined
  }

  const preferredMediaTypes = ['application/json', 'multipart/form-data', 'application/x-www-form-urlencoded']

  for (const mediaType of preferredMediaTypes) {
    const media = content[mediaType]
    if (media && typeof media === 'object') {
      if (media.schema) {
        return media.schema.$ref ? resolveRef(spec, media.schema.$ref) : media.schema
      }
      return media.$ref ? resolveRef(spec, media.$ref) : media
    }
  }

  const [firstMedia] = Object.values(content)
  if (firstMedia && typeof firstMedia === 'object') {
    if (firstMedia.schema) {
      return firstMedia.schema.$ref ? resolveRef(spec, firstMedia.schema.$ref) : firstMedia.schema
    }
    return firstMedia.$ref ? resolveRef(spec, firstMedia.$ref) : firstMedia
  }

  return undefined
}

function schemaToTs(schema, spec, seenRefs = new Set(), depth = 0) {
  if (!schema || typeof schema !== 'object') {
    return 'unknown'
  }

  if ('$ref' in schema && typeof schema.$ref === 'string') {
    if (seenRefs.has(schema.$ref)) {
      return 'unknown'
    }
    const refSchema = resolveRef(spec, schema.$ref)
    if (!refSchema) {
      return 'unknown'
    }
    const nextSeenRefs = new Set(seenRefs)
    nextSeenRefs.add(schema.$ref)
    return schemaToTs(refSchema, spec, nextSeenRefs, depth)
  }

  if ('oneOf' in schema && Array.isArray(schema.oneOf)) {
    return schema.oneOf.map((item) => schemaToTs(item, spec, new Set(seenRefs), depth)).join(' | ')
  }

  if ('anyOf' in schema && Array.isArray(schema.anyOf)) {
    return schema.anyOf.map((item) => schemaToTs(item, spec, new Set(seenRefs), depth)).join(' | ')
  }

  if ('allOf' in schema && Array.isArray(schema.allOf)) {
    return schema.allOf.map((item) => schemaToTs(item, spec, new Set(seenRefs), depth)).join(' & ')
  }

  if ('enum' in schema && Array.isArray(schema.enum) && schema.enum.length > 0) {
    return schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  }

  if ('const' in schema) {
    return JSON.stringify(schema.const)
  }

  const nullable = schema.nullable ? ' | null' : ''
  const type = schema.type

  if (type === 'string') {
    return `string${nullable}`
  }

  if (type === 'number' || type === 'integer') {
    return `number${nullable}`
  }

  if (type === 'boolean') {
    return `boolean${nullable}`
  }

  if (type === 'null') {
    return 'null'
  }

  if (type === 'array' || 'items' in schema) {
    const items = schema.items ? schemaToTs(schema.items, spec, new Set(seenRefs), depth) : 'unknown'
    return `${items}[]${nullable}`
  }

  if (type === 'object' || 'properties' in schema || 'additionalProperties' in schema) {
    const currentIndent = '  '.repeat(depth)
    const fieldIndent = '  '.repeat(depth + 1)
    const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : {}
    const required = new Set(Array.isArray(schema.required) ? schema.required : [])
    const entries = []

    for (const [key, value] of Object.entries(properties)) {
      const propertySchema = value && typeof value === 'object' ? value : {}
      const propDoc = (propertySchema.description || propertySchema.title || '').trim()
      entries.push(...buildDocComment(propDoc, fieldIndent))
      const propType = schemaToTs(propertySchema, spec, new Set(seenRefs), depth + 1)
      entries.push(`${fieldIndent}${toTypePropertyKey(key)}${required.has(key) ? '' : '?'}: ${propType};`)
    }

    if (schema.additionalProperties && schema.additionalProperties !== true) {
      entries.push(`${fieldIndent}[key: string]: ${schemaToTs(schema.additionalProperties, spec, new Set(seenRefs), depth + 1)};`)
    } else if (schema.additionalProperties === true) {
      entries.push(`${fieldIndent}[key: string]: unknown;`)
    }

    if (!entries.length) {
      return `Record<string, unknown>${nullable}`
    }

    return `{
${entries.join('\n')}
${currentIndent}}${nullable}`
  }

  return `unknown${nullable}`
}

function collectOperations(spec) {
  const operations = []
  const usedNames = new Set()
  const paths = spec.paths ?? {}

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods ?? {})) {
      if (!mutationMethods.has(method) && !queryMethods.has(method)) {
        continue
      }
      const opName = pickOperationName(method, path, operation, usedNames)
      operations.push({ path, method, operation, opName })
    }
  }

  return operations
}

function getRequestBodySchema(operation, spec) {
  return getSchemaFromContent(spec, operation.requestBody?.content)
}

function getResponseSchema(operation, spec) {
  const responses = operation.responses ?? {}
  const successKeys = Object.keys(responses).filter((status) => /^2\d\d$/.test(status))
  const candidateKeys = successKeys.length ? successKeys : Object.keys(responses)

  for (const key of candidateKeys) {
    const schema = getSchemaFromContent(spec, responses[key]?.content)
    if (schema) {
      return schema
    }
  }

  return undefined
}

function resolveParameter(spec, parameter) {
  if (!parameter || typeof parameter !== 'object') {
    return undefined
  }

  if ('$ref' in parameter && typeof parameter.$ref === 'string') {
    const resolved = resolveRef(spec, parameter.$ref)
    return resolved && typeof resolved === 'object' ? resolved : undefined
  }

  return parameter
}

function getOperationParameters(operation, spec) {
  return (operation.parameters ?? [])
    .map((parameter) => resolveParameter(spec, parameter))
    .filter(Boolean)
}

function buildParametersSchema(parameters, location) {
  const targetParameters = parameters.filter((parameter) => parameter.in === location)
  if (!targetParameters.length) {
    return undefined
  }

  const schema = {
    type: 'object',
    properties: {},
    required: [],
  }

  for (const parameter of targetParameters) {
    const paramName = String(parameter.name ?? '').trim()
    if (!paramName) {
      continue
    }

    const propertySchema = parameter.schema && typeof parameter.schema === 'object'
      ? { ...parameter.schema }
      : {}

    if (!propertySchema.description && parameter.description) {
      propertySchema.description = parameter.description
    }

    schema.properties[paramName] = propertySchema
    if (parameter.required) {
      schema.required.push(paramName)
    }
  }

  return Object.keys(schema.properties).length ? schema : undefined
}

function getUnwrappedResponseSchema(schema, spec, seenRefs = new Set()) {
  if (!schema || typeof schema !== 'object') {
    return schema
  }

  if ('$ref' in schema && typeof schema.$ref === 'string') {
    if (seenRefs.has(schema.$ref)) {
      return schema
    }
    const refSchema = resolveRef(spec, schema.$ref)
    if (!refSchema) {
      return schema
    }
    const nextSeenRefs = new Set(seenRefs)
    nextSeenRefs.add(schema.$ref)
    return getUnwrappedResponseSchema(refSchema, spec, nextSeenRefs)
  }

  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties : undefined
  if (!properties) {
    return schema
  }

  const hasEnvelopeMarker = 'data' in properties && ('code' in properties || 'message' in properties)
  if (!hasEnvelopeMarker) {
    return schema
  }

  const dataSchema = properties.data
  return dataSchema && typeof dataSchema === 'object' ? dataSchema : schema
}

function buildClient(spec) {
  const operations = collectOperations(spec)
  const typeImports = operations.flatMap((item) => {
    const pascalName = toPascalCase(item.opName)
    return [`${pascalName}Response`, `${pascalName}Variables`]
  })

  const lines = [
    'import { request, type ApiRequestConfig } from \'../http\'',
    ...(typeImports.length ? [`import type { ${typeImports.join(', ')} } from './types'`] : []),
    '',
    'export type ApiMethod =',
    '  | \'get\'',
    '  | \'post\'',
    '  | \'put\'',
    '  | \'patch\'',
    '  | \'delete\'',
    '  | \'head\'',
    '  | \'options\'',
    '',
  ]

  for (const item of operations) {
    const { path, method, operation, opName } = item
    const pascalName = toPascalCase(opName)
    const operationParameters = getOperationParameters(operation, spec)
    const pathParams = operationParameters.filter((param) => param.in === 'path')
    const queryParams = operationParameters.filter((param) => param.in === 'query')
    const hasPathParams = pathParams.length > 0
    const hasQueryParams = queryParams.length > 0
    const hasRequiredPathParams = pathParams.some((param) => param.required)
    const hasRequiredQueryParams = queryParams.some((param) => param.required)
    const hasRequestBody = Boolean(operation.requestBody)
    const hasRequiredRequestBody = Boolean(operation.requestBody?.required)
    const useDirectBodyMode = hasRequestBody && !hasPathParams && !hasQueryParams
    const useDirectQueryMode = !hasRequestBody && !hasPathParams && hasQueryParams
    const variablesName = `${ pascalName }Variables`
    const responseName = `${ pascalName }Response`
    const keyName = `${ opName }QueryKey`
    const functionName = opName
    const operationDoc = buildOperationDoc(operation)

    const hasRequiredVariables = useDirectBodyMode || useDirectQueryMode || hasRequiredPathParams || hasRequiredQueryParams || hasRequiredRequestBody
    const signature = hasRequiredVariables
      ? `variables: ${variablesName}`
      : `variables: ${variablesName} | undefined = undefined`
    const functionLines = useDirectBodyMode
      ? [
          `  return request<${responseName}>({`,
          `    url: ${JSON.stringify(path)},`,
          `    method: ${JSON.stringify(method)} as ApiMethod,`,
          '    data: variables,',
          '    ...config,',
          '  })',
        ]
      : useDirectQueryMode
      ? [
          `  return request<${responseName}>({`,
          `    url: ${JSON.stringify(path)},`,
          `    method: ${JSON.stringify(method)} as ApiMethod,`,
          '    queryParams: variables,',
          '    ...config,',
          '  })',
        ]
      : [
          `  const requestVariables = (variables ?? {}) as { path?: Record<string, unknown>; query?: Record<string, unknown>; body?: unknown }`,
          `  return request<${responseName}>({`,
          `    url: ${JSON.stringify(path)},`,
          `    method: ${JSON.stringify(method)} as ApiMethod,`,
          `    pathParams: 'path' in requestVariables ? requestVariables.path : undefined,`,
          `    queryParams: 'query' in requestVariables ? requestVariables.query : undefined,`,
          `    data: 'body' in requestVariables ? requestVariables.body : undefined,`,
          '    ...config,',
          '  })',
        ]

    lines.push(
      ...buildDocComment(operationDoc),
      `export const ${functionName} = (${signature}, config: ApiRequestConfig = {}) => {`,
      ...functionLines,
      '}',
      '',
    )

    if (queryMethods.has(item.method)) {
      lines.push(
        `export const ${keyName} = (${hasRequiredVariables ? `variables: ${variablesName}` : `variables: ${variablesName} | undefined = undefined`}) => [${JSON.stringify(opName)}, variables] as const`,
        '',
      )
    }
  }
  
  return ensureTrailingNewline(lines.join('\n'))
}

function buildTypes(spec) {
  const operations = collectOperations(spec)

  const lines = [
    '// Auto-generated API request/response types.',
    '',
  ]

  for (const item of operations) {
    const { path, method, operation, opName } = item
    const pascalName = toPascalCase(opName)
    const operationParameters = getOperationParameters(operation, spec)
    const pathParams = operationParameters.filter((param) => param.in === 'path')
    const queryParams = operationParameters.filter((param) => param.in === 'query')
    const hasPathParams = pathParams.length > 0
    const hasQueryParams = queryParams.length > 0
    const hasRequiredQueryParams = queryParams.some((param) => param.required)
    const hasRequestBody = Boolean(operation.requestBody)
    const hasRequiredRequestBody = Boolean(operation.requestBody?.required)
    const useDirectBodyMode = hasRequestBody && !hasPathParams && !hasQueryParams
    const variablesName = `${pascalName}Variables`
    const responseName = `${pascalName}Response`
    const responseSchema = getUnwrappedResponseSchema(getResponseSchema(operation, spec), spec)
    const requestBodySchema = getRequestBodySchema(operation, spec)
    const responseType = responseSchema ? schemaToTs(responseSchema, spec) : 'void'
    const pathSchema = buildParametersSchema(operationParameters, 'path')
    const querySchema = buildParametersSchema(operationParameters, 'query')
    const pathType = pathSchema ? schemaToTs(pathSchema, spec) : 'never'
    const queryType = querySchema ? schemaToTs(querySchema, spec) : 'never'
    const bodyType = requestBodySchema ? schemaToTs(requestBodySchema, spec) : 'void'
    const operationDoc = buildOperationDoc(operation)

    lines.push(
      ...buildDocComment(operationDoc && `【响应体】${operationDoc}`),
      `export type ${responseName} = ${responseType}`,
    )

    if (useDirectBodyMode) {
      lines.push(
        ...buildDocComment(operationDoc && `【请求参数】${operationDoc}`),
        `export type ${variablesName} = ${bodyType}`,
      )
    } else if (hasPathParams || hasQueryParams || hasRequestBody) {
      // 拍平参数：直接把 path 和 query 参数合并到顶层
      const mergedFieldLines = []
      
      // 添加 path 参数
      if (hasPathParams) {
        const pathProperties = pathSchema?.properties || {}
        const pathRequired = new Set(pathSchema?.required || [])
        for (const [key, value] of Object.entries(pathProperties)) {
          const propDoc = (value?.description || value?.title || '').trim()
          mergedFieldLines.push(...buildDocComment(propDoc, '  '))
          const propType = schemaToTs(value, spec)
          const propKey = toTypePropertyKey(key)
          mergedFieldLines.push(`  ${propKey}: ${propType};`)
        }
      }
      
      // 添加 query 参数
      if (hasQueryParams) {
        const queryProperties = querySchema?.properties || {}
        const queryRequired = new Set(querySchema?.required || [])
        for (const [key, value] of Object.entries(queryProperties)) {
          const propDoc = (value?.description || value?.title || '').trim()
          mergedFieldLines.push(...buildDocComment(propDoc, '  '))
          const propType = schemaToTs(value, spec)
          const isRequired = queryRequired.has(key)
          const propKey = toTypePropertyKey(key)
          mergedFieldLines.push(`  ${isRequired ? propKey : `${propKey}?`}: ${propType};`)
        }
      }
      
      // 添加 body 参数
      if (hasRequestBody) {
        const bodyDoc = (requestBodySchema?.description || requestBodySchema?.title || '').trim()
        mergedFieldLines.push(...buildDocComment(bodyDoc, '  '))
        mergedFieldLines.push(`  ${hasRequiredRequestBody ? 'body' : 'body?'}: ${bodyType};`)
      }
      
      lines.push(
        ...buildDocComment(operationDoc && `【请求参数】${operationDoc}`),
        `export type ${variablesName} = {`,
        ...mergedFieldLines,
        '}',
      )
    } else {
      lines.push(
        ...buildDocComment(operationDoc && `【请求参数】${operationDoc}`),
        `export type ${variablesName} = undefined`,
      )
    }

    lines.push('')
  }

  return ensureTrailingNewline(lines.join('\n'))
}

function buildHooks(spec) {
  const operations = collectOperations(spec)
  const hasQueryOperations = operations.some((item) => queryMethods.has(item.method))
  const hasMutationOperations = operations.some((item) => mutationMethods.has(item.method))
  const reactQueryImports = [
    hasMutationOperations ? 'useMutation' : null,
    hasQueryOperations ? 'useQuery' : null,
    hasMutationOperations ? 'type UseMutationOptions' : null,
    hasQueryOperations ? 'type UseQueryOptions' : null,
  ].filter(Boolean)

  const lines = [
    `import { ${reactQueryImports.join(', ')} } from '@tanstack/react-query'`,
    'import type { ApiError } from \'../http\'',
    'import {',
    ...operations.map((item) => `  ${ item.opName },`),
    ...operations.filter((item) => queryMethods.has(item.method)).map((item) => `  ${ item.opName }QueryKey,`),
    '} from \'./client\'',
    'import type {',
    ...operations.map((item) => `  ${ toPascalCase(item.opName) }Response,`),
    ...operations.map((item) => `  ${ toPascalCase(item.opName) }Variables,`),
    "} from './types'",
    '',
  ]
  
  for (const item of operations) {
    const pascalName = toPascalCase(item.opName)
    const responseName = `${ pascalName }Response`
    const variablesName = `${ pascalName }Variables`
    const keyName = `${ item.opName }QueryKey`
    const hookName = `use${ pascalName }`
    const operationDoc = buildOperationDoc(item.operation)
    const pathParams = (item.operation.parameters ?? []).filter((param) => param.in === 'path')
    const queryParams = (item.operation.parameters ?? []).filter((param) => param.in === 'query')
    const hasPathParams = pathParams.length > 0
    const hasQueryParams = queryParams.length > 0
    const hasRequiredPathParams = pathParams.some((param) => param.required)
    const hasRequiredQueryParams = queryParams.some((param) => param.required)
    const hasRequestBody = Boolean(item.operation.requestBody)
    const hasRequiredRequestBody = Boolean(item.operation.requestBody?.required)
    const useDirectBodyMode = hasRequestBody && !hasPathParams && !hasQueryParams
    const hasRequiredVariables = useDirectBodyMode || hasRequiredPathParams || hasRequiredQueryParams || hasRequiredRequestBody
    
    if (queryMethods.has(item.method)) {
      lines.push(
        ...buildDocComment(operationDoc),
        `export function ${ hookName }<TData = ${ responseName }, TError = ApiError>(${hasRequiredVariables ? `variables: ${variablesName}` : `variables: ${variablesName} | undefined = undefined`}, options?: Omit<UseQueryOptions<${ responseName }, TError, TData, ReturnType<typeof ${ keyName }>>, 'queryKey' | 'queryFn'>) {`,
        `  return useQuery({`,
        `    queryKey: ${ keyName }(variables),`,
        `    queryFn: () => ${ item.opName }(variables),`,
        '    ...options,',
        '  })',
        '}',
        '',
      )
    } else if (mutationMethods.has(item.method)) {
      lines.push(
        ...buildDocComment(operationDoc),
        `export function ${ hookName }<TError = ApiError>(options?: Omit<UseMutationOptions<${ responseName }, TError, ${ variablesName }>, 'mutationFn'>) {`,
        `  return useMutation({`,
        `    mutationFn: (variables: ${ variablesName }) => ${ item.opName }(variables),`,
        '    ...options,',
        '  })',
        '}',
        '',
      )
    }
  }
  
  return ensureTrailingNewline(lines.join('\n'))
}

function buildIndex() {
  return ensureTrailingNewline(`export * from './types'\nexport * from './client'\nexport * from './hooks'\nexport type * from './schema'\n`)
}

async function main() {
  const apifoxConfig = await loadApifoxConfig()
  const specPath = resolve(projectRoot, String(apifoxConfig.outputFile ?? 'src/api/generated/apifox-openapi.json'))
  const rawSpec = await readFile(specPath, 'utf8')
  const spec = JSON.parse(rawSpec.replace(/^\uFEFF/, ''))
  if (!spec?.paths) {
    throw new Error(`在 ${ specPath } 中没有找到 paths，请先同步 Apifox OpenAPI 文档。`)
  }
  
  await mkdir(generatedDir, { recursive: true })
  
  const schemaCli = resolve(openapiPackageRoot, 'bin/cli.js')
  const tempSpecPath = resolve(tmpdir(), 'apifox-openapi-spec.json')
  await writeFile(tempSpecPath, `${ JSON.stringify(spec, null, 2) }\n`, 'utf8')
  
  execFileSync(process.execPath, [schemaCli, tempSpecPath, '--output', schemaPath], {
    cwd: projectRoot,
    stdio: 'inherit',
  })
  
  await writeFile(typesPath, buildTypes(spec), 'utf8')
  await writeFile(clientPath, buildClient(spec), 'utf8')
  await writeFile(hooksPath, buildHooks(spec), 'utf8')
  await writeFile(indexPath, buildIndex(), 'utf8')
  
  console.log(`API schema 已生成：${ schemaPath }`)
  console.log(`API types 已生成：${ typesPath }`)
  console.log(`API client 已生成：${ clientPath }`)
  console.log(`API hooks 已生成：${ hooksPath }`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})


