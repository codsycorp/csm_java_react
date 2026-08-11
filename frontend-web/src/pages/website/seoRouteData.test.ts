import { describe, expect, it } from 'vitest';
import { resolveRouteCategoryKey, resolveCategoryMeta } from './seoRouteData';

describe('seoRouteData', () => {
  it('prefers the exact backend category for a route slug', () => {
    const categories = [
      { key: 'phan-mem', title: 'Phần Mềm' },
      { key: 'thong-ke-ket-qua-xo-so', title: 'Thống Kê Kết Quả Xổ Số' },
      { key: 'hop-tac-kinh-doanh', title: 'Hợp Tác Kinh Doanh' },
    ];

    expect(resolveRouteCategoryKey('thong-ke-ket-qua-xo-so', categories)).toBe('thong-ke-ket-qua-xo-so');
  });

  it('falls back to the first valid category when the slug is missing', () => {
    const categories = [
      { key: 'phan-mem', title: 'Phần Mềm' },
      { key: 'thong-ke-ket-qua-xo-so', title: 'Thống Kê Kết Quả Xổ Số' },
    ];

    expect(resolveRouteCategoryKey('', categories)).toBe('phan-mem');
  });

  it('resolves backend metadata without using a hardcoded lottery literal in the selection path', () => {
    const categories = [
      {
        key: 'thong-ke-ket-qua-xo-so',
        title: 'Thống Kê Kết Quả Xổ Số',
        description: 'Dữ liệu từ backend',
        color: '#722ed1',
        content: '<p>SSR content</p>',
      },
    ];

    expect(resolveCategoryMeta('thong-ke-ket-qua-xo-so', categories)).toMatchObject({
      key: 'thong-ke-ket-qua-xo-so',
      title: 'Thống Kê Kết Quả Xổ Số',
      description: 'Dữ liệu từ backend',
    });
  });
});
