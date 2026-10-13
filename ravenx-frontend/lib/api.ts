// lib/api.ts
import axios from 'axios'

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:5000',
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('ravenx_token')
    if (token) config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

const PUBLIC_PATHS = ['/dashboard/traders']

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      const url: string = error.config?.url ?? ''
      const isPublic = PUBLIC_PATHS.some((p) => url.startsWith(p))
      if (!isPublic) {
        // Clear stale token but don't redirect — let the auth hook handle re-login
        localStorage.removeItem('ravenx_token')
        window.dispatchEvent(new StorageEvent('storage', { key: 'ravenx_token', newValue: null }))
      }
    }
    return Promise.reject(error)
  }
)
