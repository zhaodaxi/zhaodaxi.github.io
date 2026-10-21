export function chineseDate(isoDate: string, timeZone = 'Asia/Shanghai') {
  const instant = new Date(`${isoDate}T12:00:00+08:00`);
  const weekday = new Intl.DateTimeFormat('zh-CN', {
    timeZone,
    weekday: 'long',
  }).format(instant);
  const [year, month, day] = isoDate.split('-');
  return {
    weekday,
    label: `${year}年${Number(month)}月${Number(day)}日`,
    short: `${Number(month)}月${Number(day)}日`,
  };
}

export function absoluteTime(iso?: string, timeZone = 'Asia/Shanghai') {
  if (!iso) return '';
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(time));
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
  return `${Number(pick('month'))}月${Number(pick('day'))}日 ${pick('hour').padStart(2, '0')}:${pick('minute').padStart(2, '0')}`;
}

export function todayInTimeZone(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function formatCount(value: number) {
  return new Intl.NumberFormat('zh-CN').format(value);
}
