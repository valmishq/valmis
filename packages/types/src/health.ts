/** Response shape for the GET /health endpoint */
export interface HealthResponse {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
}
