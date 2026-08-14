import axios from 'axios';
import { env } from '@/config/env';
import type { ApiError } from '@/types/api';

export const apiClient = axios.create({
  baseURL: env.apiGatewayUrl,
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const apiError: Partial<ApiError> = {
      success: false,
      error: {
        code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
        message: error.response?.data?.error?.message || error.message || 'Unexpected error',
      }
    };
    return Promise.reject(apiError);
  },
);
