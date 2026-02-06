/// <reference types="vite/client" />

// 声明导入 .txt 文件为原始文本的类型
declare module '*.txt' {
  const content: string;
  export default content;
}

declare module '*.txt?raw' {
  const content: string;
  export default content;
}
