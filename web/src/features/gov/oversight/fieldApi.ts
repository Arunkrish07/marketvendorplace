import { apiClient } from '@/lib/apiClient';
import type { FieldSummary, FieldJobsPage, OversightJobDetail, FieldFlag } from '@/types/domain';

export const fieldKeys = {
  summary: ['gov', 'oversight', 'field', 'summary'] as const,
  flags: ['gov', 'oversight', 'field', 'flags'] as const,
  jobs: (limit: number, offset: number, status?: string) =>
    ['gov', 'oversight', 'field', 'jobs', limit, offset, status ?? null] as const,
  job: (id: string) => ['gov', 'oversight', 'field', 'job', id] as const,
};

export const fetchFieldSummary = () => apiClient.get<FieldSummary>('/api/gov/oversight/field/summary');
export const fetchFieldFlags = () => apiClient.get<FieldFlag[]>('/api/gov/oversight/field/flags');
export const fetchFieldJobs = (limit: number, offset: number, status?: string) =>
  apiClient.get<FieldJobsPage>(
    `/api/gov/oversight/field/jobs?limit=${limit}&offset=${offset}${status ? `&status=${encodeURIComponent(status)}` : ''}`,
  );
export const fetchFieldJob = (id: string) => apiClient.get<OversightJobDetail>(`/api/gov/oversight/field/jobs/${id}`);
