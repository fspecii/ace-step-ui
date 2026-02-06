# ACE-Step UI 国际化使用指南

## 概述

本项目已实现中英文双语支持，默认语言为中文。

## 架构

```
ace-step-ui/
├── i18n/
│   └── translations.ts          # 翻译文件
├── context/
│   └── I18nContext.tsx          # i18n Context Provider
└── components/                   # 已支持国际化的组件
```

## 如何使用

### 1. 在组件中使用翻译

```tsx
import { useI18n } from '../context/I18nContext';

function YourComponent() {
  const { t } = useI18n();
  
  return <div>{t('yourTranslationKey')}</div>;
}
```

### 2. 切换语言

在设置面板中可以切换语言，或通过代码：

```tsx
const { language, setLanguage } = useI18n();

// 切换到英文
setLanguage('en');

// 切换到中文
setLanguage('zh');
```

### 3. 添加新的翻译键

在 `i18n/translations.ts` 中同时添加英文和中文翻译：

```typescript
export const translations = {
  en: {
    // 添加英文
    yourNewKey: 'Your English Text',
  },
  zh: {
    // 添加中文
    yourNewKey: '你的中文文本',
  }
};
```

## 已翻译的组件

- ✅ App.tsx (主应用、错误消息、Toast提示)
- ✅ Sidebar.tsx (导航栏)
- ✅ UsernameModal.tsx (用户名设置弹窗)
- ✅ SettingsModal.tsx (设置面板，包含语言切换)

## 翻译覆盖范围

- 导航菜单 (创作/音乐库/搜索)
- 用户认证 (登录/登出)
- 主题切换 (浅色/深色模式)
- 错误和成功提示
- 设置界面
- 移动端按钮

## 语言持久化

用户选择的语言会自动保存到 `localStorage`，下次访问时会自动应用。

## 注意事项

1. 所有翻译键必须同时在 `en` 和 `zh` 中定义
2. 使用 TypeScript 类型 `TranslationKey` 确保类型安全
3. 默认语言为中文 (zh)
4. 如果翻译键不存在，会返回键名本身
