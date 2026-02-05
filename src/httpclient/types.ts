import { AxiosRequestConfig } from 'axios';

export interface HttpClientOptions {
  baseUrl: string;
  timeout?: number;  // ms for requests
  connectTimeout?: number;
  retryCount?: number;  // retries on timeout
  headers?: Record<string, string>;  // common headers
  propagateHeaders?: string[];  // e.g. ['x-request-id', 'authorization'] from current req
}

export interface RequestOptions {
  timeout?: number;
  headers?: Record<string, string>;
  body?: any;  // for POST/PUT etc.
  retryCount?: number;
}
