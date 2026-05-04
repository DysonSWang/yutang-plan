export function parseJSON(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}

export function cleanStreamText(text) {
  if (!text) return '';
  return text
    .replace(/^[\s]*[\[\{][\s]*/gm, '')
    .replace(/[\s]*[\]\}][\s]*[,]?[\s]*$/gm, '')
    .replace(/"[^"]*"\s*:\s*/g, '')
    .replace(/^\s*"|"\s*[,]?\s*$/gm, '')
    .replace(/\\n/g, '\n')
    .replace(/\\"/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function filterReasoning(text) {
  if (!text) return '';
  return text
    .split(/[。\n]/)
    .filter(s => {
      const t = s.trim();
      if (!t) return false;
      if (/json/i.test(t)) return false;
      if (/overview.*venue.*schedule|包含.*字段|字段.*包含/.test(t)) return false;
      if (/我们被要求|需要生成|注意.*格式|按照.*格式|确保.*输出|返回.*格式|根据.*要求.*生成/.test(t)) return false;
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function formatLocalDateTime(date) {
  if (!date) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function formatDateRelative(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (target.getTime() === today.getTime()) return '今天';
  if (target.getTime() === tomorrow.getTime()) return '明天';
  if (target < today) return '已过期';

  const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  if (diff <= 7) return `本周${'日一二三四五六'[date.getDay()]}`;

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
