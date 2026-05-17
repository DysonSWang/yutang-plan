# 追爱AI · Claude Code 项目配置

## 项目入口
cd /home/admin/zhuiai

## 启动命令
- 后端：`cd backend && npm run dev`（端口 3005）
- 前端：`cd frontend && npm run dev`（端口 5181）

## 技术栈
- 前端：React + Chakra UI + Vite + Socket.IO Client
- 后端：Express.js + Prisma ORM + SQLite
- AI：通义千问 + 智普AI

## GSD
使用 `.gsd/` 目录追踪项目进度，`.planning/` 是旧版规划（仅供参考）。

## 双端部署

Web 和 APK 共用同一套前端代码，配置差异见 [双端部署 SOP](file:///home/admin/.claude/projects/-home-admin/memory/dual_platform_deploy.md)。

## 铁律
- **一律使用中文回复**，无论用户使用何种语言提问

## 代码修改流程
**每次修改代码前，先用 `code-review-graph` 分析影响范围和依赖关系，避免遗漏。**
- 使用 `/review-changes` 查看当前改动
- 使用 `/build-graph` 更新知识图谱（如有需要）
- 使用 `/explore-codebase` 探索代码结构

## 禁忌
- 不泄露客户信息
- 不用敏感词

## gstack
Use /browse from gstack for all web browsing. Never use mcp__claude-in-chrome__* tools.

Available skills:
- **Think**: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`
- **Build**: `/review`, `/investigate`, `/design-review`
- **Test**: `/qa`, `/qa-only`, `/benchmark`
- **Ship**: `/ship`, `/land-and-deploy`, `/canary`, `/document-release`, `/release`
- **Reflect**: `/retro`
- **Power Tools**: `/browse`, `/setup-browser-cookies`, `/codex`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`, `/setup-deploy`

If gstack skills aren't working, run: `cd ~/.claude/skills/gstack && ./setup`

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
