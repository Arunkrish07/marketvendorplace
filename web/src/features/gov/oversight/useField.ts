import { useQuery } from '@tanstack/react-query';
import { fieldKeys, fetchFieldSummary, fetchFieldFlags, fetchFieldJobs, fetchFieldJob } from './fieldApi';

export const useFieldSummary = () =>
  useQuery({ queryKey: fieldKeys.summary, queryFn: fetchFieldSummary });
export const useFieldFlags = () =>
  useQuery({ queryKey: fieldKeys.flags, queryFn: fetchFieldFlags });
export const useFieldJobs = (limit: number, offset: number, status?: string) =>
  useQuery({
    queryKey: fieldKeys.jobs(limit, offset, status),
    queryFn: () => fetchFieldJobs(limit, offset, status),
  });
export const useFieldJob = (id: string | null) =>
  useQuery({ queryKey: fieldKeys.job(id ?? ''), queryFn: () => fetchFieldJob(id as string), enabled: Boolean(id) });
