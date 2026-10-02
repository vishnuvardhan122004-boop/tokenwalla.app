import { photoIndexAt } from './gallery';

const W = 390;

describe('photoIndexAt', () => {
  test('a settled page maps to its own index', () => {
    expect(photoIndexAt(0, W, 3)).toBe(0);
    expect(photoIndexAt(W, W, 3)).toBe(1);
    expect(photoIndexAt(2 * W, W, 3)).toBe(2);
  });

  test('mid-swipe rounds to the nearer page', () => {
    expect(photoIndexAt(W * 0.49, W, 3)).toBe(0);
    expect(photoIndexAt(W * 0.51, W, 3)).toBe(1);
  });

  test('iOS rubber-banding past either end stays in range', () => {
    expect(photoIndexAt(-80, W, 3)).toBe(0);        // dragged past the first
    expect(photoIndexAt(3 * W, W, 3)).toBe(2);      // dragged past the last
  });

  test('no width yet means the first photo, never NaN', () => {
    expect(photoIndexAt(0, 0, 3)).toBe(0);
    expect(photoIndexAt(120, 0, 3)).toBe(0);
  });

  test('an empty gallery does not produce -1', () => {
    expect(photoIndexAt(0, W, 0)).toBe(0);
  });
});
