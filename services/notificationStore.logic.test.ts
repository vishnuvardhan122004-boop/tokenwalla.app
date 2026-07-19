import type { AppNotification } from './notificationStore';
import {
  clearByAudience,
  countUnread,
  insertNotification,
  markManyRead,
  markOneRead,
  removeById,
  selectForAudience,
} from './notificationStore.logic';

// Small factory for test notifications.
function n(id: string, over: Partial<AppNotification> = {}): AppNotification {
  return {
    id,
    title: `t-${id}`,
    body: `b-${id}`,
    audience: 'patient',
    createdAt: Number(id) || 0,
    read: false,
    ...over,
  };
}

describe('insertNotification', () => {
  it('adds a new entry, newest first', () => {
    const items = [n('100'), n('50')];
    const next = insertNotification(items, n('200'));
    expect(next.map((x) => x.id)).toEqual(['200', '100', '50']);
  });

  it('sorts strictly by createdAt descending regardless of insert position', () => {
    const items = [n('300'), n('100')];
    const next = insertNotification(items, n('200'));
    expect(next.map((x) => x.id)).toEqual(['300', '200', '100']);
  });

  it('is a no-op returning the SAME reference when the id already exists', () => {
    const items = [n('100'), n('50')];
    const next = insertNotification(items, n('100', { title: 'dupe' }));
    expect(next).toBe(items);
  });

  it('caps the list to max, dropping the oldest', () => {
    const items = [n('30'), n('20'), n('10')];
    const next = insertNotification(items, n('40'), 3);
    expect(next.map((x) => x.id)).toEqual(['40', '30', '20']); // '10' dropped
    expect(next).toHaveLength(3);
  });
});

describe('markOneRead', () => {
  it('marks the matching unread entry and leaves others untouched', () => {
    const items = [n('2'), n('1')];
    const next = markOneRead(items, '1');
    expect(next.find((x) => x.id === '1')!.read).toBe(true);
    expect(next.find((x) => x.id === '2')!.read).toBe(false);
  });

  it('returns the same reference when the id is absent', () => {
    const items = [n('1')];
    expect(markOneRead(items, 'nope')).toBe(items);
  });

  it('returns the same reference when the entry is already read', () => {
    const items = [n('1', { read: true })];
    expect(markOneRead(items, '1')).toBe(items);
  });
});

describe('markManyRead', () => {
  it('marks every unread when no audience is given', () => {
    const items = [n('1'), n('2', { audience: 'hospital' })];
    const next = markManyRead(items);
    expect(next.every((x) => x.read)).toBe(true);
  });

  it('marks only the given audience, leaving the other audience unread', () => {
    const items = [n('1', { audience: 'patient' }), n('2', { audience: 'hospital' })];
    const next = markManyRead(items, 'patient');
    expect(next.find((x) => x.id === '1')!.read).toBe(true);
    expect(next.find((x) => x.id === '2')!.read).toBe(false);
  });

  it('returns the same reference when nothing is unread in scope', () => {
    const items = [n('1', { read: true }), n('2', { audience: 'hospital' })];
    expect(markManyRead(items, 'patient')).toBe(items);
  });
});

describe('removeById', () => {
  it('removes the matching entry', () => {
    const items = [n('1'), n('2')];
    expect(removeById(items, '1').map((x) => x.id)).toEqual(['2']);
  });

  it('returns the same reference when the id is not found', () => {
    const items = [n('1')];
    expect(removeById(items, 'nope')).toBe(items);
  });
});

describe('clearByAudience', () => {
  it('clears everything when no audience is given', () => {
    const items = [n('1'), n('2', { audience: 'hospital' })];
    expect(clearByAudience(items)).toEqual([]);
  });

  it('clears only the given audience', () => {
    const items = [n('1', { audience: 'patient' }), n('2', { audience: 'hospital' })];
    expect(clearByAudience(items, 'patient').map((x) => x.id)).toEqual(['2']);
  });

  it('returns the same reference when nothing matches the audience', () => {
    const items = [n('1', { audience: 'patient' })];
    expect(clearByAudience(items, 'hospital')).toBe(items);
  });

  it('returns the same reference when clearing all of an already-empty list', () => {
    const items: AppNotification[] = [];
    expect(clearByAudience(items)).toBe(items);
  });
});

describe('selectForAudience', () => {
  it('filters to one audience', () => {
    const items = [n('1', { audience: 'patient' }), n('2', { audience: 'hospital' })];
    expect(selectForAudience(items, 'hospital').map((x) => x.id)).toEqual(['2']);
  });

  it('returns all (same reference) when no audience is given', () => {
    const items = [n('1'), n('2')];
    expect(selectForAudience(items)).toBe(items);
  });
});

describe('countUnread', () => {
  it('counts all unread when no audience is given', () => {
    const items = [n('1'), n('2', { read: true }), n('3', { audience: 'hospital' })];
    expect(countUnread(items)).toBe(2);
  });

  it('counts unread within one audience only', () => {
    const items = [
      n('1', { audience: 'patient' }),
      n('2', { audience: 'patient', read: true }),
      n('3', { audience: 'hospital' }),
    ];
    expect(countUnread(items, 'patient')).toBe(1);
  });

  it('is zero when all are read', () => {
    expect(countUnread([n('1', { read: true }), n('2', { read: true })])).toBe(0);
  });
});
