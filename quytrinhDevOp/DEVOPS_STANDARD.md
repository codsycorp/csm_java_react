# DEVOPS STANDARD — Chuẩn Quy Trình DevOps (CTO Playbook)

> **Phiên bản:** 1.0 | **Người ban hành:** CTO | **Ngày:** 2026-08-20
> **Đối tượng:** Mọi dự án (backend Go / Node / Java / Rust / PHP, frontend, monolith, microservice).
> **Mục đích:** File này đóng gói chuẩn quy trình DevOps từ Requirement → Git → CI/CD → Cloud → Vận hành → Cải tiến.
> **Cách dùng:** Chép file này vào gốc repo của bất kỳ dự án nào (tên `DEVOPS_STANDARD.md`). AI Agent (Claude Code / Codex / Cursor / Copilot) **phải đọc và tuân thủ file này trước mọi task**.

### 🚀 Câu lệnh khởi động AI (paste vào bất kỳ AI nào sau khi chép file vào dự án)

> Đọc `DEVOPS_STANDARD.md` ở gốc repo. Thực thi AI Execution Protocol (Section 7):
> audit toàn bộ dự án theo 6 yêu cầu (Section 1) và 4 mắt xích (0.4) bằng lệnh thật,
> tạo `DEVOPS_AUDIT.md` với bảng trạng thái ✅/❌/△ kèm bằng chứng,
> liệt kê checklist (Section 8) và đề xuất các việc cần làm theo thứ tự ưu tiên.
> Chưa được báo "xong" khi chưa đủ bằng chứng.

---

## 0. TRIẾT LÝ CỐT LÕI

```
VIBE CODING (Ý tưởng → Code)      +      DEVOPS (Code → Sản phẩm vận hành)
   AI tăng tốc tạo mã nguồn                  Kiểm soát & vận hành an toàn
         10x tốc độ                                   100% kiểm soát
```

### 0.1 Vòng lặp DevOps liên tục (bắt buộc, khép kín)

```
BƯỚC 1           BƯỚC 2           BƯỚC 3           BƯỚC 4           BƯỚC 5           BƯỚC 6
Phát triển  →    Kiểm tra    →    Triển khai   →    Phát hiện lỗi →  Theo dõi     →   Cải tiến
(AI + Dev)      (CI tự động)     (CD tự động)      (Alerting)      (Monitoring)     (Vòng lặp mới)
```

### 0.2 Tam giác tiêu chuẩn tối thượng (không được hy sinh trụ cột nào)

| Trụ cột | Tiêu chuẩn |
|---|---|
| **STABILITY (Ổn định)** | Uptime ≥ 99.9% (target 99.99%), Zero Downtime deploy |
| **SECURITY (Bảo mật)** | Zero Trust, dữ liệu & secret mã hóa, phân quyền nghiêm ngặt |
| **COST (Chi phí)** | Auto Scaling, tài nguyên tối ưu, không lãng phí Cloud |

### 0.3 Nguyên tắc quản trị

> **Con người quyết định chiến lược — AI hỗ trợ thực thi.**
> AI được phép: sinh code, refactor, test, phân tích log, đề xuất.
> Con người nắm: phê duyệt Production, quyền truy cập, rollback, secret, backup (phê duyệt 2 lớp).

### 0.4 4 mắt xích tự động hóa (mỗi dự án phải có đủ 4)

```
1. AI AGENT        →  sinh mã, viết chức năng, refactor tự động
2. GIT REPOSITORY  →  commit, phân nhánh, lịch sử rõ ràng
3. TESTING & CI    →  unit test, lint, phát hiện lỗi sớm, 100% pass
4. CD DEPLOYMENT   →  đóng gói container, đưa bản mới lên Production
```

---

## 1. SÁU YÊU CẦU BẤT BIẾN (DoD — Definition of Done)

Một feature được coi là **HOÀN THÀNH** chỉ khi đạt đủ 6 tiêu chí. AI phải tự đánh giá trước khi báo "xong":

| # | Yêu cầu | Tiêu chí đo được | Chặn deploy khi |
|---|---|---|---|
| 1 | **Tested** (Kiểm thử tự động) | `go test ./...` (hoặc tương đương) 100% pass; coverage ≥ 70% vùng logic mới | Có test fail |
| 2 | **Deployed** (Triển khai tự động) | Luồng CD phát hành lên Live Server qua pipeline | Deploy thủ công bằng tay |
| 3 | **Secured** (Bảo mật) | Không có secret trong code/git history; quản lý secret tập trung; mã hóa dữ liệu nhạy cảm | Secret lộ trong repo |
| 4 | **Monitored** (Giám sát 24/7) | Có endpoint metrics, log tập trung, dashboard CPU/RAM/Latency/Error rate | Không có observability |
| 5 | **Resilient** (Phục hồi) | Rollback tức thì ≤ 5 phút; backup định kỳ; restore có runbook | Không có cơ chế rollback |
| 6 | **Stable Updates** (Cập nhật ổn định) | Nâng cấp không gián đoạn (zero downtime / atomic swap) | Deploy ghi đè trực tiếp |

---

## 2. GIAI ĐOẠN 1: TỪ REQUIREMENT ĐẾN GIT (6 bước)

> Mỗi bước có **deliverable bắt buộc** và **gate duyệt** (con người hoặc CI).

| Bước | Nội dung | Deliverable | Người thực thi | Gate |
|---|---|---|---|---|
| 1 | **Xác định Requirement** | `docs/specs/<feature>.md` | Con người chốt yêu cầu | Chốt scope |
| 2 | **Thiết kế** | `docs/arch/<feature>.drawio` (hoặc .md sơ đồ) | Dev/Architect | Duyệt thiết kế |
| 3 | **AI Implement Code** | Mã nguồn + tests | AI Agent (Claude Code/Codex) | Tự sinh, không tự duyệt |
| 4 | **Developer Review** | Code review (PR) | Con người | ≥ 1 reviewer approve |
| 5 | **Run Automated Testing** | Kết quả CI pass | CI | 100% test pass |
| 6 | **Git Commit & Push** | Commit chuẩn + push | AI/Dev | Hook commitlint |

### 2.1 Chuẩn Git

- Nhánh: `main` (production) + `feature/<tên>` / `fix/<tên>` / `hotfix/<tên>`.
- Commit message theo Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `perf:`, `test:`.
- **KHÔNG commit**: `config.*.env`, `.env*`, `*.key`, `*.pem`, `*.crt`, `ossutilconfig`, `*.bak`, file log, build artifact, model file (`.gguf`).
- Lint staged trước commit; nếu legacy code vi phạm → thêm `ignorePatterns` cho file cũ, KHÔNG tắt rule cho toàn dự án.

### 2.2 Template spec.md (bắt buộc cho feature > 0.5 ngày công)

```markdown
# Feature: <tên>
## Mục tiêu / Yêu cầu nghiệp vụ (REQUIREMENT)
## Giới hạn (non-goals)
## Thiết kế (link arch.drawio)
## API / Giao diện thay đổi
## Kế hoạch test (unit + integration + manual)
## Tiêu chí Done (6 mục ở Section 1)
```

---

## 3. GIAI ĐOẠN 2: CI/CD TỰ ĐỘNG (git push → Cloud)

### 3.1 Luồng chuẩn

```
git push → CI check (test + lint + vet) → Build (Docker image / binary) → CD Deploy → Cloud LIVE 99.9%
```

### 3.2 Yêu cầu CI (tối thiểu, chạy trên mọi push/PR)

| Hạng mục | Bắt buộc | Ghi chú |
|---|---|---|
| Trigger | push/PR vào main, workflow_dispatch | Không chấp nhận CI "stub" chỉ manual |
| Test | Lệnh test của stack, 100% pass | Chặn merge nếu fail |
| Static check | `go vet` / `eslint` / `tsc` / `mvn verify` | Theo stack |
| Build | Build ra artifact / image | Build fail = pipeline fail |
| Thời gian | < 15 phút | Chia job song song nếu cần |

### 3.3 Template GitHub Actions (thay `<COMMANDS>` theo bảng stack)

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: {}
  workflow_dispatch: {}
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5  # hoặc node/java/rust tương ứng
        with: { go-version: '1.25' }
      - run: <LINT_CMD>      # vet / lint / typecheck
      - run: <TEST_CMD>      # 100% pass
      - run: <BUILD_CMD>     # ra artifact
```

### 3.4 Yêu cầu CD

- Artifact build 1 lần trong CI → reuse cho CD (không build lại ở server).
- Deploy **atomic**: copy ra file `.candidate` → `mv` đè → health check → xóa file cũ. Không bao giờ ghi đè file đang chạy.
- Health check sau deploy bắt buộc (ví dụ `GET /api/monitoring/health`).
- Có **rollback 1 lệnh**: giữ binary/image bản trước, script rollback ≤ 5 phút.

---

## 4. GIAI ĐOẠN 3: HẠ TẦNG & OBSERVABILITY

### 4.1 Chuỗi hạ tầng chuẩn

```
Containerization (Docker, môi trường nhất quán 100%)
      → Hosting (VPS / Cloud: nginx + systemd / K8s)
      → Observability (Metrics + Logs + Tracing)
      → Continuous Loop (Phát triển → Triển khai → Giám sát → Cải tiến)
```

### 4.2 Observability tối thiểu (bắt buộc, không phải scaffold trưng bày)

| Chỉ số | Tên metric (chuẩn) | Nguồn |
|---|---|---|
| Error rate 5xx | `<svc>_http_requests_total{status="5.."}` | Endpoint `/metrics` (Prometheus) |
| Latency p99 | `<svc>_http_request_duration_seconds_bucket` | Endpoint `/metrics` |
| CPU / RAM | node exporter / dashboard | Prometheus + Grafana |
| Log tập trung | Loki / journald / ELK | Promtail |
| Sự cố AI/LLM | `<svc>_llama_requests_total{result}` | App |

- **Alert SLO mẫu**: error rate > 1% (10 phút) → page; p99 > 500ms → ticket; error budget < 10% → page.
- Endpoint metrics phải được **wired vào code thật** (middleware ghi counter + histogram), không chỉ tồn tại config.

---

## 5. GIAI ĐOẠN 4: BẢO MẬT & QUẢN TRỊ (Con người quyết định)

| Hạng mục | Chuẩn |
|---|---|
| **Secrets** | KHÔNG trong repo; dùng env file ngoài git (`.gitignore`), vault/SSM; rotate khi lộ |
| **Quyền truy cập Prod** | Phân quyền rõ (admin/dev/sub-user); **phê duyệt 2 lớp** cho deploy Production |
| **Rollback** | Quyết định rollback thuộc con người; thời điểm khôi phục an toàn, có runbook |
| **Backup** | Sao lưu định kỳ (DB + data dir), kiểm thử restore định kỳ, có kế hoạch khẩn cấp |
| **Mã hóa** | Dữ liệu nhạy cảm mã hóa khi lưu trữ; TLS toàn bộ traffic |

---

## 6. XỬ LÝ SỰ CỐ: GIAO THỨC DEV + AI AGENT

```
1. CẢNH BÁO  → Alert kích hoạt (error rate / latency / uptime)
2. CONTEXT   → Dev cung cấp log, stack trace, thời điểm, phạm vi
3. PHÂN TÍCH → AI Agent đọc Stack Trace, đề xuất bản vá + code
4. DUYỆT     → Dev phê duyệt giải pháp
5. VÁ LỖI    → AI sửa code, chạy test, thử nghiệm bản vá
6. MERGE     → Bản vá pass CI → CD lên Production
7. VÒNG LẶP  → Theo dõi sau deploy, đóng alert, cải tiến
```

---

## 7. AI EXECUTION PROTOCOL (Giao thức AI khi đọc file này)

> **Phần này là luật cho AI Agent.** Khi AI được giao task trong dự án có file này, AI phải:

1. **Đọc file này trước tiên**, áp dụng làm chuẩn cho mọi việc làm.
2. **Audit dự án** (chạy lệnh thật, không đoán) và tạo bảng đối chiếu 6 yêu cầu (Section 1) + 4 mắt xích (0.4):

   ```
   | Yêu cầu | Trạng thái (✅/❌/△) | Bằng chứng (file/lệnh) | Hành động cần làm |
   ```

3. **Không được** báo "xong" khi chưa pass đủ 6 tiêu chí. Nếu không thể (legacy, hạ tầng), phải liệt kê rõ blocker và đề xuất.
4. **Không tự commit secret**; nếu phát hiện secret trong repo → cảnh báo + đề xuất rotate.
5. **Mọi thay đổi code phải kèm test**; mọi thay đổi hạ tầng phải kèm runbook.
6. Kết quả audit ghi vào `DEVOPS_AUDIT.md` ở gốc repo, cập nhật theo mỗi giai đoạn.
7. Ưu tiên tạo **checklist theo giai đoạn** (Section 8) và đánh dấu tiến độ `[x]`/`[ ]`.

---

## 8. CHECKLIST CHẠY ĐƯỢC (AI phải đi qua từng dòng)

### Giai đoạn 1 — Requirement → Git
- [ ] `docs/specs/` tồn tại cho feature đang làm
- [ ] `docs/arch/` có thiết kế cho feature
- [ ] Code mới có test đi kèm
- [ ] `git diff` không chứa secret/env/bak/artifact
- [ ] Commit theo Conventional Commits
- [ ] PR có review của con người

### Giai đoạn 2 — CI/CD
- [ ] Workflow CI trigger push/PR (không phải stub manual)
- [ ] CI chạy: lint/vet → test → build, tất cả pass
- [ ] Có CD đưa artifact lên server (không build ở server)
- [ ] Health check sau deploy
- [ ] Rollback script ≤ 5 phút, đã thử ít nhất 1 lần

### Giai đoạn 3 — Hạ tầng & Observability
- [ ] App expose `/metrics` (Prometheus) có dữ liệu thật
- [ ] Grafana dashboard: error rate, p99, CPU, RAM, uptime
- [ ] Log tập trung (journald/Loki/ELK)
- [ ] Alert SLO cấu hình (error rate, latency, budget)

### Giai đoạn 4 — Bảo mật & Quản trị
- [ ] `.gitignore` chặn env/secret/key/bak
- [ ] Không secret trong `git log` / file tracked
- [ ] Backup chạy định kỳ + restore đã kiểm thử
- [ ] Phân quyền Prod + phê duyệt 2 lớp

---

## 9. BẢNG LỆNH THEO STACK (dùng cho template CI/checklist)

| Stack | Lint/Check | Test | Build |
|---|---|---|---|
| **Go** | `go vet ./...` | `go test ./...` | `go build ./...` |
| **Node/TS** | `npx tsc --noEmit` + `eslint` | `npm test` | `npm run build` |
| **Java** | `mvn verify -DskipTests` | `mvn test` | `mvn package` |
| **Rust** | `cargo clippy -- -D warnings` | `cargo test` | `cargo build --release` |
| **PHP** | `php -l` + phpcs | `phpunit` | `composer install --no-dev` |

---

## 10. RUNBOOK MẪU — ROLLBACK VÀ KHẨN CẤP

```bash
# ROLLBACK (atomic swap — mọi project phải có bản tương đương)
# 1. Giữ bản trước: .candidate cũ / image tag cũ / backup binary
# 2. Dừng service → thay binary → start → health check
systemctl stop csm-go
mv /opt/app/current /opt/app/prev          # hoặc docker tag app:prev app:current
mv /opt/app/candidate /opt/app/current
systemctl start csm-go
curl -fsS http://127.0.0.1:PORT/api/monitoring/health && echo OK
# 3. Sai → lặp lại với bản prev. Đúng → xóa prev sau 24h
```

---

## 11. ĐỊNH NGHĨA "HOÀN THÀNH" (dùng để báo cáo)

> Một task/feature chỉ được AI báo **DONE** khi có cả 6 chứng chỉ:
> ✅ Tested → ✅ Deployed → ✅ Secured → ✅ Monitored → ✅ Resilient → ✅ Stable Updates
> Kèm link/bằng chứng cụ thể. Thiếu cái nào, báo rõ trạng thái và bước kế tiếp.