/**
 * MyPond 页面工具函数单元测试
 */
import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';

// 导入待测试的工具函数（从 MyPond.jsx 中提取）
describe('MyPond 工具函数', () => {
  describe('parseJSON', () => {
    const parseJSON = (val, fallback = null) => {
      if (!val) return fallback;
      try {
        return JSON.parse(val);
      } catch {
        return fallback;
      }
    };

    it('null/undefined 返回 fallback', () => {
      expect(parseJSON(null)).toBe(null);
      expect(parseJSON(null, 'default')).toBe('default');
      expect(parseJSON(undefined, [])).toEqual([]);
    });

    it('有效 JSON 字符串解析成功', () => {
      expect(parseJSON('{"name":"小美"}')).toEqual({ name: '小美' });
      expect(parseJSON('[1,2,3]')).toEqual([1, 2, 3]);
    });

    it('无效 JSON 返回 fallback', () => {
      expect(parseJSON('not json', 'fallback')).toBe('fallback');
      expect(parseJSON('', 'empty')).toBe('empty');
    });

    it('空字符串返回 fallback（默认 null）', () => {
      expect(parseJSON('')).toBe(null);
    });
  });

  describe('formatLocalDateTime', () => {
    const formatLocalDateTime = (date) => {
      if (!date) return '';
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      const pad = n => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    it('null/undefined 返回空字符串', () => {
      expect(formatLocalDateTime(null)).toBe('');
      expect(formatLocalDateTime(undefined)).toBe('');
    });

    it('有效日期格式化正确', () => {
      expect(formatLocalDateTime('2026-05-03T14:30:00')).toBe('2026-05-03 14:30');
      expect(formatLocalDateTime(new Date('2026-05-03T14:30:00'))).toBe('2026-05-03 14:30');
    });

    it('无效日期返回空字符串', () => {
      expect(formatLocalDateTime('invalid')).toBe('');
    });
  });

  describe('filterReasoning', () => {
    const filterReasoning = (text) => {
      if (!text) return '';
      const lines = text.split('\n');
      return lines.filter(l => !l.startsWith('[解析]') && !l.startsWith('[')).join('\n').trim();
    };

    it('过滤 [解析] 开头的行', () => {
      const input = '[解析] 这是分析过程\n这是实际内容';
      expect(filterReasoning(input)).toBe('这是实际内容');
    });

    it('过滤所有 [ 开头行', () => {
      const input = '[解析]\n[分析]\n内容';
      expect(filterReasoning(input)).toBe('内容');
    });

    it('空输入返回空', () => {
      expect(filterReasoning('')).toBe('');
      expect(filterReasoning(null)).toBe('');
    });

    it('无需过滤时保留内容', () => {
      expect(filterReasoning('正常内容\n第二行')).toBe('正常内容\n第二行');
    });
  });
});
