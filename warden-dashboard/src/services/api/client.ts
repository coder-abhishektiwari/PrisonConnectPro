import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { env } from '@/config/env';
import { getStoredTokens, persistAuth } from '@/services/auth/tokenStorage';
import type { ApiError } from '@/types/api';

interface FailedQueueItem {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

let isRefreshing = false;
let failedQueue: FailedQueueItem[] = [];

function processQueue(error: Error | null, token: string | null = null) {
  while (failedQueue.length) {
    const { resolve, reject } = failedQueue.shift()!;
    if (error) {
      reject(error);
    } else {
      resolve(token);
    }
  }
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: env.apiGatewayUrl,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add authorization header to requests
apiClient.interceptors.request.use((config) => {
  try {
    const tokens = getStoredTokens();
    if (tokens && tokens.accessToken) {
      (config.headers as Record<string, string>).Authorization = 'Bearer ' + tokens.accessToken;
    }
  } catch (e) {
    // noop
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token: unknown) => {
            originalRequest.headers!.Authorization = 'Bearer ' + (token as string);
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      isRefreshing = true;

      try {
        const storedTokens = getStoredTokens();
        if (!storedTokens) {
          // No tokens available, clear auth and reject
          localStorage.removeItem('pc_warden_tokens');
          localStorage.removeItem('pc_warden_user');
          return Promise.reject(error);
        }

        // Refresh the token
        const response = await axios.post<{ success: boolean; data: { accessToken: string; refreshToken: string; expiresIn: number } }>(
          `${env.apiGatewayUrl}/auth/refresh`,
          { refreshToken: storedTokens.refreshToken }
        );

        const { accessToken, refreshToken, expiresIn } = response.data.data;
        const tokens = { accessToken, refreshToken, expiresIn };
        persistAuth(tokens, {} as any);

        // Process queued requests
        processQueue(null, accessToken);

        // Retry original request with new token
        originalRequest.headers!.Authorization = 'Bearer ' + accessToken;
        isRefreshing = false;
        return apiClient(originalRequest);
      } catch (refreshError) {
        // Refresh failed, logout and redirect to login
        isRefreshing = false;
        processQueue(refreshError as Error, null);
        // Clear auth state
        localStorage.removeItem('pc_warden_tokens');
        localStorage.removeItem('pc_warden_user');
        return Promise.reject(refreshError);
      }
    }

    const apiError: ApiError = {
      message: error.response?.data?.message ?? error.message ?? 'Unexpected error',
      status: error.response?.status,
    };
    return Promise.reject(apiError);
  },
);
