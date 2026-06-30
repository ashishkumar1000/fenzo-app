/**
 * Mock job data for the Jobs list, until `@services/jobService` exists.
 */
import type { Job, JobFilter } from './types';

export const MOCK_JOBS: Job[] = [
  {
    id: 'job_1',
    customerName: 'Priya Sharma',
    description: 'AC gas refill + cleaning',
    serviceIcon: 'snowflake',
    status: 'progress',
    timeLabel: '2:00 – 4:00 PM',
    technicianName: 'Suresh Kumar',
    amount: 1416,
  },
  {
    id: 'job_2',
    customerName: 'Ramesh Kumar',
    description: 'AC not cooling',
    serviceIcon: 'snowflake',
    status: 'scheduled',
    timeLabel: '11:00 AM – 12:30 PM',
    technicianName: 'Suresh Kumar',
    amount: 1800,
  },
  {
    id: 'job_3',
    customerName: 'Anil Desai',
    description: 'Water purifier service',
    serviceIcon: 'droplet',
    status: 'scheduled',
    timeLabel: '10:30 AM',
    technicianName: 'Vijay Singh',
    amount: 900,
  },
  {
    id: 'job_4',
    customerName: 'Deepak Joshi',
    description: 'AC gas top-up',
    serviceIcon: 'snowflake',
    status: 'scheduled',
    timeLabel: '5:00 PM',
    technicianName: 'Suresh Kumar',
    amount: 1200,
  },
  {
    id: 'job_5',
    customerName: 'Fatima Sheikh',
    description: 'Geyser repair',
    serviceIcon: 'wrench',
    status: 'done',
    timeLabel: 'Yesterday, 3:00 PM',
    technicianName: 'Vijay Singh',
    amount: 2200,
  },
  {
    id: 'job_6',
    customerName: 'Karan Mehta',
    description: 'Split AC installation',
    serviceIcon: 'snowflake',
    status: 'done',
    timeLabel: 'Yesterday, 11:00 AM',
    technicianName: 'Suresh Kumar',
    amount: 4500,
  },
  {
    id: 'job_7',
    customerName: 'Sneha Iyer',
    description: 'Water purifier filter change',
    serviceIcon: 'droplet',
    status: 'cancelled',
    timeLabel: 'Mon, 9:00 AM',
    technicianName: 'Vijay Singh',
    amount: 0,
  },
];

export const JOB_FILTERS: { value: JobFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
];
