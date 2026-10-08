# 配表校验工具：给角色配置表加数值校验

## 定义配置表 schema

- Edit `tools/config_check/schema.ts`，为 `Character` 增加 element、baseAtk、critRate 字段约束

## 实现数值规则

- Create `tools/config_check/rules.ts`：暴击率 0–1、攻击力不超过同稀有度上限

## 补测试

- Write `tools/config_check/rules.test.ts` 覆盖越界与正常两类样例

## 跑测试

- Run `pnpm test`
