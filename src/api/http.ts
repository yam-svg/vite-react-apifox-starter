import axios, { AxiosHeaders, type AxiosInstance, type AxiosRequestConfig } from 'axios'

export interface ApiRequestConfig extends AxiosRequestConfig {
  pathParams?: Record<string, unknown>
  queryParams?: Record<string, unknown>
}

export interface ApiError extends Error {
  status?: number
  code?: string
  data?: unknown
  isApiError: true
}

interface ApiEnvelope<TData = unknown> {
  code?: number | string
  message?: string
  data?: TData
}

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '/api'
const withCredentials = String(import.meta.env.VITE_API_WITH_CREDENTIALS ?? 'false') === 'true'
const authTokenKey = import.meta.env.VITE_API_AUTH_TOKEN_KEY ?? 'access_token'

function readAuthToken() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(authTokenKey)
  } catch {
    return null
  }
}

function appendQueryValue(searchParams: URLSearchParams, key: string, value: unknown) {
  if (value === undefined || value === null) return
  if (value instanceof Date) {
    searchParams.append(key, value.toISOString())
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => appendQueryValue(searchParams, key, item))
    return
  }
  if (typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([childKey, childValue]) => {
      appendQueryValue(searchParams, `${key}[${childKey}]`, childValue)
    })
    return
  }
  searchParams.append(key, String(value))
}

function stringifyQueryParams(queryParams?: Record<string, unknown>) {
  if (!queryParams) return ''
  const searchParams = new URLSearchParams()
  Object.entries(queryParams).forEach(([key, value]) => appendQueryValue(searchParams, key, value))
  return searchParams.toString()
}

function applyPathParams(url: string, pathParams?: Record<string, unknown>) {
  if (!pathParams) return url
  return Object.entries(pathParams).reduce((result, [key, value]) => {
    const encoded = encodeURIComponent(String(value))
    return result.replaceAll(`{${key}}`, encoded).replaceAll(`:${key}`, encoded)
  }, url)
}

function createApiError(message: string, extras: Partial<ApiError> = {}): ApiError {
  const error = new Error(message) as ApiError
  error.name = 'ApiError'
  error.isApiError = true
  Object.assign(error, extras)
  return error
}

function buildApiError(error: unknown): ApiError {
  const fallbackMessage = '请求失败，请稍后重试'

  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data
    const message =
      typeof responseData === 'string'
        ? responseData
        : responseData && typeof responseData === 'object' && 'message' in responseData
          ? String((responseData as { message?: unknown }).message ?? fallbackMessage)
          : error.message || fallbackMessage

    return createApiError(message, {
      status: error.response?.status,
      code: error.code,
      data: responseData,
    })
  }

  if (error instanceof Error) {
    return createApiError(error.message || fallbackMessage, { data: error })
  }

  return createApiError(fallbackMessage, { data: error })
}

function unwrapApiEnvelope<TResponse>(data: TResponse): TResponse {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data

  const envelope = data as ApiEnvelope<TResponse>
  const isEnvelope = 'data' in envelope && ('code' in envelope || 'message' in envelope)
  return isEnvelope ? (envelope.data as TResponse) : data
}

export const httpClient: AxiosInstance = axios.create({
  baseURL,
  withCredentials,
  timeout: 30000,
})

httpClient.interceptors.request.use((config) => {
  const token = readAuthToken()
  if (!token) return config

  const headers = AxiosHeaders.from(config.headers)
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  config.headers = headers
  return config
})

httpClient.interceptors.response.use(
  (response) => ({ ...response, data: unwrapApiEnvelope(response.data) }),
  (error) => Promise.reject(buildApiError(error)),
)

export async function request<TResponse>(config: ApiRequestConfig): Promise<TResponse> {
  const { pathParams, queryParams, url = '', ...axiosConfig } = config
  const resolvedUrl = applyPathParams(url, pathParams)
  const queryString = stringifyQueryParams(queryParams)
  const finalUrl = queryString
    ? `${resolvedUrl}${resolvedUrl.includes('?') ? '&' : '?'}${queryString}`
    : resolvedUrl

  const response = await httpClient.request<TResponse>({ ...axiosConfig, url: finalUrl })
  return response.data
}

