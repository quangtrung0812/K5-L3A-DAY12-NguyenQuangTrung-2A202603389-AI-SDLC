# Bằng chứng Kiểm chứng Phase 3 — TICKET-03 *"Đèn cạn dầu"* (Test Contract v1.2)

- **Ngày thực hiện:** 2026-11-20
- **Tag mục tiêu:** `phase-3`
- **Tác giả:** Nguyễn Quang Trung (`2A202603389`)

## 1. Bảng truy vết Yêu cầu (TICKET-03 → Mã nguồn → Bằng chứng)

| Nhóm yêu cầu TICKET-03 | Triển khai chính | Bằng chứng kiểm chứng | Trạng thái |
|---|---|---|---|
| **1. Nhiên liệu đèn (1/60 nguyên), châm dầu, `lantern_out`, thắp lại 5 đom đóm** | `src/sim/tuning.ts`, `src/sim/engine.ts` (`fuelUnits`, Bước 2 & Bước 5) | Unit tests `tests/sim.test.ts` + Headless `P3-01`, `P3-02` | **PASS** |
| **2. Bóng Mực hút dầu (`drain`), mất vùng an toàn `< 30`, đẩy ra 30t khi châm `≥ 30`** | `src/sim/engine.ts` (`isLanternSafeActive`, Bước 2, 6, 7, 8) | Unit tests `tests/sim.test.ts` + Headless `P3-03`, `P3-04` | **PASS** |
| **3. Luật thắng mới `dawn_survived` (`240/270/300s`, `≥ ceil(0.6×N)`), bỏ `all_lit`** | `src/sim/engine.ts` (`evaluateWinLoss`, Bước 11) | Unit tests + Headless `R02` (không thắng sớm), `P3-05`, `R06` | **PASS** |
| **4. Sức chứa tăng dần `10 + 2×successful_lights` (tối đa 20) + HUD động** | `src/sim/engine.ts` (`getCarryCapacity`), `src/client/main.ts` | Unit tests + Headless `P3-06`, `R02`, `P3-02` | **PASS** |
| **5. Công thức điểm mới v1.2 (`+5/mote`, `+100`/`+40`, `+5`/`+15` drain, thưởng bình minh)** | `src/sim/tuning.ts`, `src/sim/engine.ts` | Unit tests + Headless `R02`, `P3-01`, `P3-02`, `P3-04`, `P3-05` | **PASS** |
| **6. Chế độ mù màu (`#00B3FF`, `#FFFFFF` + `⚠`) & đèn tắt xẹp `20%` + vết rách + thanh dầu `1 Hz`** | `index.html`, `src/client/style.css`, `src/client/scene.ts`, `src/client/main.ts` | Build web `vite build` + kiểm tra mã nguồn client-only | **PASS** |
| **7. Test Contract v1.2 (schema, snapshot, scenario, events, exit 2, tất định, hiệu năng)** | `game.contract.json`, `src/headless/validation.ts`, `scripts/verify-contract.mjs` | [`contract-report.md`](contract-report.md) (`21/21` PASS) | **PASS** |
| **8. DoD: ADR, Changelog, cập nhật test cũ có lý do (không skip âm thầm), regression Phase 1–2** | [`adr-001-lantern-fuel-and-dawn-win.md`](../../notes/adr-001-lantern-fuel-and-dawn-win.md), [`CHANGELOG.md`](../../../CHANGELOG.md) | `R01`, `R03–R06`, `P2-01..P2-06` giữ nguyên PASS + [`review.md`](review.md) | **PASS** |

## 2. Kết quả lệnh kiểm chứng

```bash
npm run build
npm test
```

- **Typecheck (`tsc --noEmit`) & Build (`build:headless` + `vite build`):** xanh, không lỗi.
- **Unit tests (`vitest run`):** `17/17` test PASS (bao gồm toàn bộ hồi quy Phase 1–2 và toàn bộ tính năng mới + ca biên Phase 3).
- **Contract v1.2 & Regression (`npm run verify:contract`):** `21/21` kiểm tra PASS — chi tiết đầy đủ tại [`contract-report.md`](contract-report.md).
- **Review độc lập (Independent QA Agent):** ghi nhận tại [`review.md`](review.md).
