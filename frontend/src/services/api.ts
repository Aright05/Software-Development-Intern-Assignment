import axios from 'axios';
import {
  ApiResponse,
  HealthResponse,
  ScheduledEmail,
  Sender,
  EmailCampaign,
  SlackStatus,
  EmailStats,
  CreateCampaignPayload,
  CreateSenderPayload,
  TestEmailPayload,
  User,
} from '../types';

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Response interceptor for error unwrapping
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const errorMsg =
      error.response?.data?.error?.message ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(errorMsg));
  }
);

export const api = {
  // System Health
  health: {
    check: async (): Promise<HealthResponse> => {
      const res = await apiClient.get<HealthResponse>('/health');
      return res.data;
    },
  },

  // Authentication
  auth: {
    getMe: async (): Promise<User> => {
      const res = await apiClient.get<ApiResponse<User>>('/auth/me');
      return res.data.data;
    },
    logout: async (): Promise<void> => {
      await apiClient.post('/auth/logout');
    },
    getGoogleAuthUrl: (): string => {
      return `${API_BASE_URL}/auth/google`;
    },
  },

  // Slack Integration
  slack: {
    getStatus: async (): Promise<SlackStatus> => {
      const res = await apiClient.get<ApiResponse<SlackStatus>>('/slack/status');
      return res.data.data;
    },
    getConnectUrl: (): string => {
      return `${API_BASE_URL}/slack/connect`;
    },
    disconnect: async (): Promise<void> => {
      await apiClient.post('/slack/disconnect');
    },
    sendTestNotification: async (): Promise<string> => {
      const res = await apiClient.post<ApiResponse<null>>('/slack/test-notify');
      return res.data.message || 'Notification sent';
    },
  },

  // Sender Accounts
  senders: {
    list: async (): Promise<Sender[]> => {
      const res = await apiClient.get<ApiResponse<Sender[]>>('/senders');
      return res.data.data;
    },
    create: async (data: CreateSenderPayload): Promise<Sender> => {
      const res = await apiClient.post<ApiResponse<Sender>>('/senders', data);
      return res.data.data;
    },
  },

  // Campaigns
  campaigns: {
    list: async (params?: { page?: number; limit?: number; search?: string }) => {
      const res = await apiClient.get<ApiResponse<EmailCampaign[]>>('/campaigns', { params });
      return res.data;
    },
    create: async (data: CreateCampaignPayload) => {
      const res = await apiClient.post<ApiResponse<{ campaign: EmailCampaign; totalScheduled: number }>>(
        '/campaigns',
        data
      );
      return res.data.data;
    },
  },

  // Emails & Search
  emails: {
    getScheduled: async (params?: {
      page?: number;
      limit?: number;
      search?: string;
      campaignId?: string;
      senderId?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      const res = await apiClient.get<ApiResponse<ScheduledEmail[]>>('/emails/scheduled', { params });
      return res.data;
    },

    getSent: async (params?: {
      page?: number;
      limit?: number;
      search?: string;
      campaignId?: string;
      senderId?: string;
      startDate?: string;
      endDate?: string;
    }) => {
      const res = await apiClient.get<ApiResponse<ScheduledEmail[]>>('/emails/sent', { params });
      return res.data;
    },

    getById: async (id: string): Promise<ScheduledEmail> => {
      const res = await apiClient.get<ApiResponse<ScheduledEmail>>(`/emails/${id}`);
      return res.data.data;
    },

    getStats: async (): Promise<EmailStats> => {
      const res = await apiClient.get<ApiResponse<EmailStats>>('/emails/stats');
      return res.data.data;
    },

    search: async (params: {
      q?: string;
      status?: string;
      senderId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    }) => {
      const res = await apiClient.get<ApiResponse<ScheduledEmail[]>>('/emails/search', { params });
      return res.data;
    },

    sendTest: async (data: TestEmailPayload) => {
      const res = await apiClient.post<
        ApiResponse<{
          messageId: string;
          previewUrl: string | false;
          recipient: string;
          sender: any;
          dispatchedAt: string;
        }>
      >('/emails/test-send', data);
      return res.data;
    },

    reindex: async () => {
      const res = await apiClient.post<ApiResponse<{ totalIndexed: number }>>('/emails/reindex');
      return res.data;
    },
  },
};
