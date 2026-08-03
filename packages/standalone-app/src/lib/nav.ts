import type { RouteId } from '$app/types';
import { mdiBackupRestore, mdiClock, mdiCog, mdiViewDashboard } from '@mdi/js';

export type NavItem = {
  id: RouteId;
  title: string;
  icon: string;
};

export const nav: NavItem[] = [
  { id: '/', title: 'Dashboard', icon: mdiViewDashboard },
  { id: '/backups', title: 'Backups', icon: mdiBackupRestore },
  { id: '/schedules', title: 'Schedules', icon: mdiClock },
  { id: '/settings', title: 'Configure', icon: mdiCog },
];
