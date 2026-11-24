import api from './client';
import type { ManagedRole } from '../types';

export const builtInRoles = [
  ['platform_admin', 'Platform Admin'],
  ['customer_admin', 'Customer Admin'],
  ['soc_lead', 'SOC Lead'],
  ['soc_analyst', 'SOC Analyst'],
] as const;

export const rolesApi = {
  list: () => api.get<ManagedRole[]>('/roles/'),
  create: (data: Pick<ManagedRole, 'name' | 'base_role'>) => api.post<ManagedRole>('/roles/', data),
  rename: (id: number, name: string) => api.patch<ManagedRole>(`/roles/${id}/`, { name }),
};
