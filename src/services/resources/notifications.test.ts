/**
 * Tests for the notifications service (Story 3.4): URL/method/params/body
 * per endpoint, in the jobs.test.ts mold. The paginated list, the badge
 * count and the two read-state commands are the entire wire contract —
 * the store mirrors it on top of these four calls.
 */
jest.mock('./../api/apiClient', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue({ data: {} }),
    post: jest.fn().mockResolvedValue({ data: {} }),
  },
}));

import { apiClient } from '../api/apiClient';
import { notificationService } from './notifications';

const get = apiClient.get as jest.Mock;
const post = apiClient.post as jest.Mock;

describe('notificationService.list', () => {
  it('GETs /notifications with no params for page 1', async () => {
    get.mockResolvedValueOnce({ data: { data: [], nextCursor: null, hasMore: false } });
    await notificationService.list();
    expect(get).toHaveBeenCalledWith('/notifications', { params: {} });
  });

  it('passes the cursor and limit through as params', async () => {
    get.mockResolvedValueOnce({ data: { data: [], nextCursor: 'c', hasMore: true } });
    await notificationService.list({ cursor: 'cursor-1', limit: 50 });
    expect(get).toHaveBeenCalledWith('/notifications', {
      params: { cursor: 'cursor-1', limit: 50 },
    });
  });

  it('omits params that were not given', async () => {
    get.mockResolvedValueOnce({ data: { data: [], nextCursor: null, hasMore: false } });
    await notificationService.list({ limit: 20 });
    expect(get).toHaveBeenCalledWith('/notifications', { params: { limit: 20 } });
  });
});

describe('notificationService.unreadCount', () => {
  it('GETs /notifications/unread-count and returns the payload untouched', async () => {
    get.mockResolvedValueOnce({ data: { unreadCount: 4 } });
    const res = await notificationService.unreadCount();
    expect(get).toHaveBeenCalledWith('/notifications/unread-count');
    expect(res).toEqual({ unreadCount: 4 });
  });
});

describe('notificationService.markRead', () => {
  it('POSTs the ids verbatim to /notifications/mark-read', async () => {
    post.mockResolvedValueOnce({ data: { markedCount: 2 } });
    await notificationService.markRead(['a', 'b']);
    expect(post).toHaveBeenCalledWith('/notifications/mark-read', { ids: ['a', 'b'] });
  });
});

describe('notificationService.markAllRead', () => {
  it('POSTs /notifications/mark-all-read with no body', async () => {
    post.mockResolvedValueOnce({ data: { markedCount: 0 } });
    await notificationService.markAllRead();
    expect(post).toHaveBeenCalledWith('/notifications/mark-all-read');
  });
});