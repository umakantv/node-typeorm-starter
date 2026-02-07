import axios, { AxiosInstance, AxiosResponse, AxiosError, AxiosRequestConfig } from 'axios';
import { HttpClientOptions, RequestOptions } from './types';
import { logger } from '../logger';

// HttpClient for inter-service/external calls (with retries, logging, header propagation)
export class HttpClient {
  private client: AxiosInstance;
  private options: HttpClientOptions;

  constructor(options: HttpClientOptions) {
    this.options = {
      timeout: 5000,
      connectTimeout: 5000,
      retryCount: 2,
      ...options,
    };

    this.client = axios.create({
      baseURL: this.options.baseUrl,
      timeout: this.options.timeout,
      headers: this.options.headers || {},
    });
  }

  private getPropagatedHeaders(req: any): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.options.propagateHeaders && req) {
      this.options.propagateHeaders.forEach((key) => {
        const value = req.headers[key.toLowerCase()];
        if (value) {
          headers[key] = value;
        }
      });
    }
    return headers;
  }

  private async request<T>(
    method: string,
    req: any,
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const startTime = Date.now();
    const url = path.startsWith('/') ? path : `/${path}`;
    const fullUrl = `${this.options.baseUrl}${url}`;
    const headers = { ...this.getPropagatedHeaders(req), ...(options.headers || {}) };
    const reqBody = options.body;

    // Log before request
    logger.info(req, `Outbound ${method} request`, { url: fullUrl, method });

    const retryCount = options.retryCount ?? this.options.retryCount ?? 0;
    let lastError: any;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const config: AxiosRequestConfig = {
          method: method as any,
          url,
          headers,
          timeout: options.timeout ?? this.options.timeout,
          data: reqBody,
        };

        const response: AxiosResponse<T> = await this.client.request(config);
        const latency = Date.now() - startTime;

        // Log after success
        logger.info(req, `Outbound ${method} response`, {
          url: fullUrl,
          status: response.status,
          latencyMs: latency,
        });

        return response.data;
      } catch (error: any) {
        lastError = error;
        const latency = Date.now() - startTime;
        const status = error.response?.status;

        // Log error
        logger.error(req, `Outbound ${method} failed`, {
          url: fullUrl,
          attempt: attempt + 1,
          status,
          latencyMs: latency,
          error: error.message,
        });

        // Retry only on timeout (408, 5xx, or network); throw immediately for 4xx
        if (status && status >= 400 && status < 500) {
          throw error;  // Do not retry 4xx; re-throw
        }
        if (attempt === retryCount) {
          break;  // Final attempt failed
        }
        // Wait before retry (exponential backoff simple)
        await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, attempt)));
      }
    }

    // Final error
    throw lastError;
  }

  // Public methods
  async get<T>(req: any, path: string, headers?: Record<string, string>, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('GET', req, path, { ...options, headers });
  }

  async post<T>(req: any, path: string, body?: any, headers?: Record<string, string>, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('POST', req, path, { ...options, headers, body });
  }

  async put<T>(req: any, path: string, body?: any, headers?: Record<string, string>, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PUT', req, path, { ...options, headers, body });
  }

  async patch<T>(req: any, path: string, body?: any, headers?: Record<string, string>, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('PATCH', req, path, { ...options, headers, body });
  }

  async delete<T>(req: any, path: string, headers?: Record<string, string>, options: RequestOptions = {}): Promise<T> {
    return this.request<T>('DELETE', req, path, { ...options, headers });
  }
}
