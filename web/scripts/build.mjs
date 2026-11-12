import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'dist');
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(path.join(root, 'public'), output, { recursive: true });
writeFileSync(path.join(output, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Camera Planner · 场景摄影工作台</title>
<meta name="description" content="三维场景摄影预演、Blender 式空间操作与数值镜头规划。">
<style>html,body{width:100%;height:100%;margin:0;background:#10171c;overflow:hidden}main{height:100dvh}iframe{display:block;width:100%;height:100%;border:0;background:#10171c}</style>
</head>
<body><main><iframe src="./planner/index.html" title="Camera Planner 场景摄影工作台" allow="fullscreen"></iframe></main></body>
</html>
`);
console.log('Built standalone Camera Planner workspace at web/dist/.');
