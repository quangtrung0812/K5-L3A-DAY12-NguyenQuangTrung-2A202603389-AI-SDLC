# AGENTS.md — Đảo Đèn Lồng

Hướng dẫn ngắn cho AI agent khi phát triển, kiểm chứng và phát hành dự án (đã cập nhật cho Phase 4 · Release `v1.0.0` · Contract v1.3).

## Lệnh chuẩn
- Cài đặt & build: `npm install && npm run build`
- Chạy game 3D (kèm API lưu bảng xếp hạng cục bộ): `node scripts/run.mjs` (hoặc `npm start`)
- Xuất bảng xếp hạng cục bộ: `node scripts/run.mjs --export-leaderboard out.json`
- Chạy kiểm chứng toàn bộ (typecheck + headless build + unit test + contract scenarios v1.3 + regression Phase 1–3 + determinism + soak test + leaderboard CLI + benchmark headless Đêm 3): `npm test`
- Chạy headless (Đêm 1/2/3): `node dist/headless/headless/cli.js --seed 42 --night 1 --ticks 600 --out tmp/out.jsonl`
- Chạy benchmark 3D chuẩn 1280×720 (`bench.json`): `node scripts/bench.mjs --seed 42 --duration 30 --out bench.json`
- Chạy soak test 10 Đêm liên tiếp (`soak.json`): `node --max-semi-space-size=1 --expose-gc dist/headless/headless/soak.js --seed 7 --nights 10 --out soak.json` (hoặc `npm run soak`)
- Đóng gói bản phát hành `v1.0.0`: `npm run package:release`

## Kiến trúc bắt buộc
- `src/sim/` chứa **toàn bộ logic game thuần TypeScript**: KHÔNG import Three.js, DOM, `window`, hay `Math.random()`.
- `src/sim/maps.ts` định nghĩa duy nhất địa hình chuẩn 3 Đêm (Đảo Bến, Đảo Cau, Đảo Chuông) dùng chung cho cả headless và client 3D.
- Mọi tính ngẫu nhiên trong `src/sim/` PHẢI đi qua PRNG có seed (`src/sim/prng.ts`) để đảm bảo tính tất định 100%.
- `src/sim/tuning.ts` PHẢI đồng bộ 100% với `game.contract.json` (kiểm tra tự động trong unit test).
- Nhiên liệu đèn PHẢI tính bằng **số nguyên đơn vị `1/60`** (`0..6000`) trong `src/sim/` để triệt tiêu sai số dấu phẩy động; chỉ làm tròn 1 chữ số thập phân khi xuất snapshot/event.
- `src/headless/` chỉ chứa CLI headless (`cli.ts`), validator (`validation.ts`) và soak test (`soak.ts`).
- `src/client/` chứa giao diện 3D (Three.js), bảng màu chuẩn + chế độ mù màu, trợ năng (đổi phím, phụ đề, giảm chuyển động, chữ tối thiểu `18px` + `×1.25`), bảng xếp hạng, cảnh benchmark chuẩn (`benchMode`, tắt toàn bộ hiệu ứng sáng tạo thêm) và sáng tạo client-only (KHÔNG làm đổi đầu ra headless).

## Quy ước Test Contract v1.3 (Bắt buộc)
- Giữ nguyên 100% mọi yêu cầu Contract v1.0–v1.2 (60 tick/s, thứ tự 12 bước/tick, nhiên liệu `1/60`, 6 trạng thái Bóng Mực gồm `drain`, luật thắng `dawn_survived`, điểm v1.2, exit `2` khi file sai định dạng).
- `game.contract.json` phải khai báo `contract_version: "1.3"`, `bench_cmd`, `soak_cmd` và `run_cmd` hỗ trợ `--export-leaderboard`.
- Cảnh benchmark (`benchMode`) phải dùng cảnh chuẩn Đêm 1 (`200` Bóng Mực `wander`, `100` đom đóm, `L1–L3` sáng `fuel=100`, camera bay vòng `r=30m, Y=15m`, `15s/vòng` CCW), tắt hoàn toàn sáng tạo thêm, đạt `avg_fps ≥ 60`, `p1_low_fps ≥ 30`, `load_ms ≤ 10000`.
- Soak test 10 Đêm liên tiếp phải đạt `crashes = 0` và `mem_end_mb ≤ 1.2 × mem_start_mb`.

## Điều cấm
- KHÔNG viết test luôn đạt, không sửa tay output bằng chứng (`bench.json`, `soak.json`, `contract-report.md`).
- KHÔNG bỏ qua (skip) hay rút gọn test cũ âm thầm khi yêu cầu đổi; phải cập nhật hoặc gỡ kèm lý do rõ ràng trong `docs/notes/` (ADR) và `CHANGELOG.md`.
- KHÔNG thay đổi hằng số chuẩn Contract (`pickup_radius = 1`, `player_speed = 6`, ...) trong `src/sim/`.
- KHÔNG commit `.env`, API key, token hay file nháp `/Phase*.md`, `/Note.md`.
- KHÔNG tuyên bố hoàn thành khi `npm test` chưa xanh.
