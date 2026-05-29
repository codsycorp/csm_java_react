# CSM Menu Runtime — Compact (Comprehend SYSTEM_MASTER digest)

Version: 2.0 · cap ~2400 chars · **structure only + dispatch** — business from USER_REQUEST

## Lego tách biệt

- **Structure:** type_form, f_*, trigger, saveMenuStruct — `ai_menu_structure_runtime.md`
- **Business:** modules/tables từ USER_REQUEST — Pass 1 Comprehend — **không** template ERP

## Admin flow

Quản lý menu → AI JSON → `saveMenuStruct` → sidebar → click → `/system/grid/:menuId`

## AdminPage dispatch

6/kanban → Kanban | 4/auto_code_name → DynamicCode | report_name → Report | 2+nodes → MasterDetail | 1 → Grid+Modal

## type_form

0=group(children) | 1=grid(table[],trigger) | 2=MD(tab table_name=field master) | 3=link | 4=code | 5/report | 6=kanban

## Field/trigger

f_* only; PK f_pkid=1; combo f_cbo_query; trigger load_db/beforeSave/update/report_db

## Greenfield output

{ "menu": [...], "notes": [], "warnings": [], "coverage_modules": [] }
