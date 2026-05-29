/** Standard API response envelope used by all backend endpoints */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
