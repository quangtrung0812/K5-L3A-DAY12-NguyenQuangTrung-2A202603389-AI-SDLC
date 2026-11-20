# Bằng chứng Kiểm chứng Phase 4 — TICKET-04 *"Bình minh: phát hành v1.0.0"* (Test Contract v1.3)

- **Ngày thực hiện:** 2026-11-21
- **Tag & Release mục tiêu:** Tag `phase-4` + GitHub Release `v1.0.0`
- **Tác giả:** Nguyễn Quang Trung (`2A202603389`)

---

## 1. Cấu hình Máy đo Thực tế (Hardware & OS)

| Thành phần | Thông số đo thực tế |
|---|---|
| **CPU** | 11th Gen Intel(R) Core(TM) i7-11800H @ 2.30GHz (16 luồng) |
| **GPU / Renderer** | Intel(R) UHD Graphics (0x00009A60) · ANGLE Direct3D11 (`vs_5_0 ps_5_0`) · Three.js `0.174.0` (WebGL2) |
| **RAM** | 15.7 GB (16 GB lắp đặt) |
| **Hệ điều hành** | Windows 11 · `Windows_NT 10.0.26200 (x64)` |
| **Runtime** | Node.js `v24.18.1`, Google Chrome (`--disable-frame-rate-limit --disable-gpu-vsync`) |

---

## 2. Kết quả Đo Thực tế (Không chỉnh sửa tay)

### A. Benchmark 3D chuẩn 1280×720 ([`bench.json`](../../../bench.json))
Lệnh chạy:
```bash
node scripts/bench.mjs --seed 42 --duration 30 --out bench.json
```

| Chỉ số | Kết quả đo thật (`bench.json`) | Ngưỡng đạt (`Phase 4`) | Trạng thái |
|---|---:|---:|---|
| `contract_version` | `"1.3"` | `"1.3"` | **PASS** |
| `avg_fps` | **`152.3` FPS** | `≥ 60` FPS | **PASS** (2.54× ngưỡng) |
| `p1_low_fps` | **`54.8` FPS** | `≥ 30` FPS | **PASS** (1.83× ngưỡng) |
| `frame_ms_p95` | **`11.3` ms** | — | **Tốt** (`~88.5` FPS tại p95) |
| `frames` | **`4570` khung** (trong `30s`) | `> 0` | **PASS** |
| `load_ms` | **`2203` ms** (`2.20 s`) | `≤ 10000` ms | **PASS** (4.5× nhanh hơn giới hạn) |
| `peak_mem_mb` | **`741.4` MB** (RSS toàn cây tiến trình Chrome) | Ghi số đo thật | **PASS** |
| `vsync_off` | **`true`** (`--disable-frame-rate-limit --disable-gpu-vsync`) | `true` | **PASS** |

*Ghi chú cảnh benchmark:* Chạy Đêm 1 đủ ánh sáng/bóng đổ chuẩn (`L1–L3` sáng `fuel = 100`), `200` Bóng Mực `wander` instanced, `100` đom đóm instanced, Mây đứng tại `(0,0,0)`, tắt hoàn toàn tạo hình/hiệu ứng sáng tạo thêm (`benchMode: true`), camera bay vòng tròn `r = 30m`, `Y = 15m`, xuất phát `(30,15,0)` quay ngược chiều kim đồng hồ `15s/vòng`, bỏ `3s` khởi động và đo đúng `30s`.

Ảnh chụp thực tế từ cảnh chuẩn: [`docs/demo/screenshot.png`](../../demo/screenshot.png).

### B. Soak test 10 Đêm liên tiếp ([`soak.json`](../../../soak.json))
Lệnh chạy:
```bash
node --max-semi-space-size=1 --expose-gc dist/headless/headless/soak.js --seed 7 --nights 10 --out soak.json
```

| Chỉ số | Kết quả đo thật (`soak.json`) | Ngưỡng đạt (`Phase 4`) | Trạng thái |
|---|---:|---:|---|
| `nights` | **`10`** (Đêm `1 → 2 → 3` xoay vòng, seed `7..16`) | `10` | **PASS** |
| `crashes` | **`0`** | `0` | **PASS** |
| `mem_start_mb` → `mem_end_mb` | **`49.4 MB` → `55.2 MB` (`1.12×`)** | `≤ 1.20×` (`≤ 59.28 MB`) | **PASS** |
| `duration_s` | **`0.32` s** | — | **PASS** |

*(Kiểm chứng bổ sung `30` Đêm liên tiếp cho `mem_start_mb = 48.7 MB` → `mem_end_mb = 57.2 MB`, `0` crash — xác nhận bộ nhớ bão hòa sau JIT lần đầu, không rò rỉ bộ nhớ).*

---

## 3. Bảng Truy vết Yêu cầu Phase 4 (TICKET-04 → Mã nguồn → Bằng chứng)

| Nhóm yêu cầu TICKET-04 | Triển khai chính | Bằng chứng kiểm chứng | Trạng thái |
|---|---|---|---|
| **1. Chế độ Benchmark chuẩn (`bench_cmd`, `bench.json`)** | `src/sim/engine.ts` (`createBenchSim`), `src/client/scene.ts` (`syncBench`, `InstancedMesh`, tắt sáng tạo), `src/client/main.ts` (`runBenchmarkMode`), `scripts/bench.mjs` | [`bench.json`](../../../bench.json) (`152.3` FPS / `54.8` p1_low / `2203ms`), unit test `createBenchSim` | **PASS** |
| **2. Soak test 10 Đêm (`soak_cmd`, `soak.json`)** | `src/headless/soak.ts`, `game.contract.json` (`soak_cmd`) | [`soak.json`](../../../soak.json) (`0` crashes, `1.12×` RSS) + `P4-SOAK` trong [`contract-report.md`](contract-report.md) | **PASS** |
| **3. Bảng xếp hạng cục bộ + `--export-leaderboard`** | `src/sim/leaderboard.ts`, `scripts/run.mjs` (`GET`/`POST /api/leaderboard`, lưu `~/.dao-den-long/leaderboard.json`, `--export-leaderboard`), `index.html`, `src/client/main.ts` | Unit test `leaderboard` (tên `3–12` ký tự + tiếng Việt NFC, Top 10, tie-break thời gian) + `P4-LB` trong [`contract-report.md`](contract-report.md) | **PASS** |
| **4. Trợ năng (Đổi 9 phím, Phụ đề + mũi tên Bóng Mực, Giảm chuyển động, `≥ 18px` + `×1.25`)** | `index.html`, `src/client/style.css` (`18px` base / `22.5px` large-text), `src/client/main.ts`, `src/client/scene.ts` | Build web `vite build` + kiểm tra mã nguồn + QA review độc lập [`review.md`](review.md) | **PASS** |
| **5. Đóng gói & Tài liệu (`README ≤ 3 lệnh`, `LICENSE`, `CREDITS`, `CHANGELOG`, Release `v1.0.0`)** | [`README.md`](../../../README.md), [`LICENSE`](../../../LICENSE), [`CREDITS.md`](../../../CREDITS.md), [`CHANGELOG.md`](../../../CHANGELOG.md), `scripts/package-release.mjs` | Sinh sạch gói `tmp/dao-den-long-v1.0.0-web.zip`, kiểm tra `npm install → npm run build → node scripts/run.mjs` | **PASS** |
| **6. Test Contract v1.3 + Regression Phase 1–3** | `game.contract.json` (`1.3`), `tests/sim.test.ts` (`19` tests), `scripts/verify-contract.mjs` (`23` checks) | [`contract-report.md`](contract-report.md) (`23/23` PASS, `19/19` unit test PASS) | **PASS** |
| **7. Retro & Nhật ký AI** | [`docs/notes/retro.md`](../../notes/retro.md), [`docs/notes/ai-log.md`](../../notes/ai-log.md) | Đủ 4 phase Evaluation, phân tích lỗi AI, harness hữu ích nhất, tổng token & bài học | **PASS** |
| **8. Đánh giá độc lập (Independent QA Review)** | Subagent `research` rà soát độc lập Phase 4 + `SUBMISSION.md` + `RUBRIC.md` | [`review.md`](review.md) | **PASS** |
