# 鱼塘计划 · Claude Code 项目配置

## 项目入口
cd /home/admin/yutang-plan

## 启动命令
- 后端：`cd backend && npm run dev`（端口 3005）
- 前端：`cd frontend && npm run dev`（端口 5181）

## 技术栈
- 前端：React + Chakra UI + Vite + Socket.IO Client
- 后端：Express.js + Prisma ORM + SQLite
- AI：通义千问 + 智普AI

## GSD
使用 `.gsd/` 目录追踪项目进度，`.planning/` 是旧版规划（仅供参考）。

## 禁忌
- 不泄露客户信息
- 不用敏感词

## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills:
- **Think**: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`
- **Build**: `/review`, `/investigate`, `/design-review`
- **Test**: `/qa`, `/qa-only`, `/benchmark`
- **Ship**: `/ship`, `/land-and-deploy`, `/canary`, `/document-release`
- **Reflect**: `/retro`
- **Power Tools**: `/browse`, `/setup-browser-cookies`, `/codex`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/setup-deploy`

If gstack skills aren't working, run: `cd ~/.claude/skills/gstack && ./setup`
