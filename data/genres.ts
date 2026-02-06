// 导入风格文本文件
import mainStyleText from './main_style.txt?raw';
import allStyleText from './all_style.txt?raw';

// 从main_style.txt读取主要风格（大类）
export const MAIN_STYLES = mainStyleText
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);

// 从all_style.txt读取所有风格
export const ALL_STYLES = allStyleText
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);

// 为了向后兼容，保留原来的GENRE_KEYS（使用主要风格）
export const GENRE_KEYS = MAIN_STYLES;

// 小类风格：从所有风格中排除主要风格（大类）
// 创建主要风格的小写集合用于快速查找
const mainStylesLower = new Set(MAIN_STYLES.map(s => s.toLowerCase().trim()));

export const SUB_STYLES = ALL_STYLES.filter(style => {
  const styleLower = style.toLowerCase().trim();
  return !mainStylesLower.has(styleLower);
});

// 类型定义
export type MainStyle = typeof MAIN_STYLES[number];
export type AllStyle = typeof ALL_STYLES[number];
export type SubStyle = typeof SUB_STYLES[number];
