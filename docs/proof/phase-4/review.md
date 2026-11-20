# Đánh giá Độc lập (Independent QA Review) — Phase 4 (`v1.0.0` · Test Contract v1.3)

- **Người rà soát:** Subagent độc lập `Phase 4 Release QA Reviewer` (`research` read-only, tách biệt ngữ cảnh với agent viết code)
- **Ngày rà soát:** 2026-11-21
- **Phạm vi đối chiếu:** `Phase4.md` (TICKET-04), `SUBMISSION.md`, `RUBRIC.md`, `game.contract.json`, toàn bộ mã nguồn `src/` & `scripts/`, `bench.json`, `soak.json`, `README.md`, `LICENSE`, `CREDITS.md`, `CHANGELOG.md`, `docs/notes/retro.md`, `docs/notes/ai-log.md`, `docs/proof/phase-4/`.

---

## 1. Các Hạng mục Đạt Yêu cầu (PASS)

1. **Test Contract v1.3 & Hồi quy Phase 1–3:** `contract_version: "1.3"`, đủ `bench_cmd`, `soak_cmd`, `run_cmd`, `headless_cmd`, `build_cmd`. Đối chiếu `git diff` với tag `phase-3` xác nhận **không** sửa hay bỏ qua âm thầm bất kỳ hằng số hoặc bài test Phase 1–3 nào (`19/19` unit tests, `23/23` kiểm tra contract). `src/sim/` hoàn toàn thuần TypeScript (0 import Three.js/DOM/`Math.random`).
2. **Chế độ Benchmark 1280×720 (`bench.json`):** Cảnh chuẩn Đêm 1 chính xác (`200` Bóng Mực `wander` instanced, `100` đom đóm instanced, `L1–L3` sáng `fuel=100`, Mây đứng tại `(0,0,0)`, tắt hoàn toàn hiệu ứng sáng tạo thêm, camera bay vòng `r=30m, Y=15m` từ `(30,15,0)` quay ngược chiều kim đồng hồ `15s/vòng`, bỏ `3s` khởi động + đo `--duration` giây). Công thức `avg_fps`, `p1_low_fps`, `frame_ms_p95`, `frames`, `load_ms` khớp tuyệt đối đặc tả; số đo thật vượt xa ngưỡng (`avg_fps: 152.3 ≥ 60`, `p1_low_fps: 54.8 ≥ 30`, `load_ms: 2203 ≤ 10000`, `vsync_off: true`).
3. **Soak test 10 Đêm (`soak.json`):** Xoay vòng Đêm `1 → 2 → 3` với seed `7 + i`, input ngẫu nhiên theo đúng tỷ lệ `30t / 5% / 3% / 2% / 10%`, kết quả thật đạt `crashes: 0`, `mem_start_mb: 49.4 → mem_end_mb: 55.2 MB` (`1.12× ≤ 1.20×`), `duration_s: 0.32 s`.
4. **Bảng xếp hạng cục bộ & `--export-leaderboard`:** Hiển thị đúng sau thắng Đêm 3 hoặc thua ở bất kỳ Đêm nào; chỉ tính tổng điểm các Đêm đã thắng (`nights_won` `0–3`); kiểm tra tên `3–12` ký tự hỗ trợ tiếng Việt chuẩn hóa NFC; sắp xếp điểm giảm dần & tie-break thời điểm sớm hơn; giữ Top 10 trên đĩa cục bộ (`~/.dao-den-long/leaderboard.json`); có màn hình Menu chính và xuất JSON chuẩn qua `--export-leaderboard`.
5. **Trợ năng (Accessibility):** Đủ 9 phím đổi được + phát hiện trùng phím + khôi phục mặc định + lưu bền vững; đủ 4 chỉ báo hình ảnh/phụ đề (Bóng Mực xuất hiện kèm mũi tên mép màn hình xử lý cả góc sau lưng camera, gió sắp thổi, 10s cuối, đèn `fuel < 30`); Giảm chuyển động tắt rung camera, FOV giật và chớp màn hình; mọi quy tắc `font-size` trong `src/client/style.css` đều `≥ 1rem = 18px` ở `1280×720` kèm chế độ Chữ lớn `×1.25` (`22.5px`).
6. **Pháp lý, Tài liệu, Harness & Bảo mật:** Không có `.env`/API key/token; `.gitignore` neo gốc `/Phase*.md` và `/Note.md`; đủ `LICENSE` (MIT), `CREDITS.md`, `CHANGELOG.md` (4 phase), `docs/notes/retro.md`, `docs/notes/ai-log.md`, `README.md` (link video ở đầu, ảnh thật, `≤ 3` lệnh chạy, mục "Sáng tạo của tôi" có bằng chứng) và gói phát hành `v1.0.0`.

---

## 2. Các Phát hiện từ Reviewer & Khắc phục Đã Áp dụng

| Mức độ | Phát hiện của Reviewer độc lập | Khắc phục đã áp dụng & Kiểm chứng | Trạng thái |
|---|---|---|---|
| **MEDIUM** | Phím đổi tùy chỉnh bị trùng âm thầm với phím dự phòng cứng (`Arrow*`, `KeyF`, `ShiftRight`, `KeyJ`, `KeyL`) trong `src/client/main.ts` | Thêm `isCodeBound(code)` trong `src/client/main.ts`: chỉ kích hoạt phím phụ (`Arrow*`, `KeyF`, `ShiftRight`, `KeyJ`, `KeyL`) khi mã phím đó chưa bị gán cho hành động nào khác và hành động gốc còn ở phím mặc định | **Đã sửa** |
| **MEDIUM** | Nhấn `Escape` khi đang mở `#menu-dialog` hoặc `#result-dialog` gây kẹt UI; nhấn `Escape` lúc đang chờ gán phím trong `#settings-dialog` có thể đóng luôn modal | Thêm `cancel` listener chặn đóng nhầm (`e.preventDefault()`) trên `menuDialog` và `resultDialog`; trên `settingsDialog`, nhấn `Escape` khi `listeningAction !== null` chỉ hủy chờ gán phím mà không đóng hộp thoại | **Đã sửa** |
| **MEDIUM** | Liên kết `docs/proof/phase-4/review.md` trong `docs/proof/phase-4/README.md` chưa có file đích | Tạo hoàn chỉnh báo cáo này tại `docs/proof/phase-4/review.md` | **Đã sửa** |
| **MINOR** | `.hud-subtitle` dùng `white-space: nowrap` có thể tràn ngang ở chế độ Chữ lớn (`22.5px`); thông báo khôi phục phím mặc định hiện màu đỏ cảnh báo | Đổi `.hud-subtitle` sang `max-width: calc(100vw - 32px); white-space: normal; text-align: center;` và thêm lớp `.keybind-status.info` màu vàng ánh sáng | **Đã sửa** |
| **MINOR** | `runBenchmarkMode` ánh xạ `--seed 0` thành `42` và fallback `load_ms` tính cuối vòng đo | Kiểm tra bằng `Number.isInteger(parsedSeed)` và lưu `firstFrameLoadMs` ngay sau khung đầu tiên | **Đã sửa** |
| **MINOR** | Sai lệch nhỏ số lượng SFX (`15` → `18`) trong `README.md` / `CREDITS.md` và số unit test Phase 3 (`15` → `17`) ở dòng 90 `docs/notes/ai-log.md` | Đã hiệu chỉnh thống nhất `18` hiệu ứng âm thanh và `17` unit test Phase 3 | **Đã sửa** |

---

## 3. Kết luận sau Khắc phục

- **Trạng thái cuối cùng:** **PASS** (0 CRITICAL, 0 MEDIUM mở).
- **Tái kiểm chứng sau sửa:** `npm run build` (`build:headless` + `vite build`), `npm test` (`19/19` unit test + `23/23` Contract v1.3), và `npm run package:release` đều xanh 100%.
- **Lưu ý trước khi nộp trên GitHub:** Kiểm tra đổi tên repo theo quy ước `SUBMISSION.md` (thêm hậu tố `-Dao-Den-Long` nếu cần), gắn tag `phase-4`, xuất bản GitHub Release `v1.0.0` đính kèm `tmp/dao-den-long-v1.0.0-web.zip` và `demo.mp4` (`< 5 phút`), và kiểm tra bằng cửa sổ ẩn danh.
