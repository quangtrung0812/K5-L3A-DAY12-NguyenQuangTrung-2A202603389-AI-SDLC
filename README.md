# Đảo Đèn Lồng — Day 12 AI SDLC

Game 3D góc nhìn thứ ba: điều khiển **Mây**, người giữ đèn nhỏ tuổi đội nón lá treo đèn lồng, gom **đom đóm** trên **Đảo Bến** để thắp sáng **5 Đèn Lồng Lớn** và xua **Bóng Mực** trong sương đen.

- **Tác giả:** Nguyễn Quang Trung (`2A202603389`)
- **Trạng thái hiện tại:** Phase 1 (Đêm 1 – Đảo Bến + Test Contract v1.0)
- **Đa nền tảng:** Chạy trực tiếp trên macOS, Linux và Windows với Node.js (>= 18).

---

## Cài đặt & Chạy (tối đa 3 lệnh)

```bash
npm install
npm run build
npm run preview
```

Mở trình duyệt tại địa chỉ hiển thị (mặc định `http://localhost:4173`).

---

## Điều khiển

| Phím / Thao tác | Hành động |
|---|---|
| `W` `A` `S` `D` hoặc `↑` `↓` `←` `→` | Di chuyển Mây theo hướng góc nhìn |
| `Space` | Nhảy |
| `E` hoặc `F` | Nạp đom đóm vào Đèn Lồng Lớn gần nhất (trong bán kính `2.6m`) |
| `Q` hoặc `Shift` | **Tỏa sáng (Pulse)** — tốn `1` đom đóm, đẩy lùi `6m` và làm choáng Bóng Mực `3s` trong bán kính `7m` (hồi chiêu `3s`) |
| Kéo chuột trái / `J` `L` | Xoay camera 3D quanh Mây |
| Nút **Chơi lại** / hộp thoại kết thúc | Bắt đầu lại Đêm 1 |

---

## Luật chơi & Cách tính điểm (Đêm 1 – Đảo Bến)

Mọi thông số gameplay được đồng bộ tuyệt đối với [`game.contract.json`](game.contract.json) và kiểm tra tự động bằng unit test:

- **Sức chứa & Thắp đèn:** Mây mang tối đa `5` đom đóm (`carry_capacity`). Nhặt tự động khi lại gần `<= 1.6m`. Mỗi Đèn Lồng Lớn cần `4` đom đóm (`lantern_cost`) để sáng; đèn đã sáng tạo vòng an toàn bán kính `5.5m` (`safe_radius`) mà Bóng Mực không thể xâm nhập.
- **Ngọn lửa & Bóng Mực:** Mây có `3` ngọn lửa (`flames`). Bị Bóng Mực chạm (`<= 1.2m`) mất `1` ngọn lửa, rơi `50%` đom đóm đang mang (`Math.floor(carried * 0.5)`) và nhận `1.5s` bất tử tạm (`invuln_s`). Đảo không có hố rơi (`fall_enabled: false`).
- **Thắng / Thua:** Thắp đủ `5/5` đèn → **Thắng (`all_lit`)**. Mất hết ngọn lửa (`no_flames`) hoặc hết `240s` (`dawn`) → **Thua**.

### Công thức tính điểm
| Sự kiện | Điểm |
|---|---|
| Nhặt 1 đom đóm (`per_mote`) | `+10` |
| Thắp sáng 1 Đèn Lồng Lớn (`per_lantern`) | `+100` |
| Làm choáng 1 Bóng Mực bằng Tỏa sáng (`per_stun`) | `+25` |
| Thưởng thời gian còn lại **khi thắng** (`per_second_left`) | `+5 × Math.floor(time_left_s)` |
| Thưởng ngọn lửa còn lại **khi thắng** (`per_flame_left`) | `+50 × flames` |

*(Không cộng thưởng thời gian/ngọn lửa nếu thua; dựng scenario trong headless không phát sự kiện và không cộng điểm.)*

---

## Kiểm thử & Chế độ Headless (Test Contract v1.0)

Chạy toàn bộ bộ kiểm chứng (typecheck + build headless + unit test + 6 kịch bản contract + kiểm tra tính tất định SHA-256 + kiểm tra mã thoát `2`):

```bash
npm test
```

Chạy trực tiếp CLI headless theo Test Contract v1.0:

```bash
node dist/headless/headless/cli.js --seed 42 --night 1 --ticks 600 --snapshot-every 10 --out tmp/out.jsonl
```

Hỗ trợ đầy đủ `--scenario <file.json>` và `--inputs <file.json>`.

---

## Sáng tạo của tôi

Toàn bộ phần sáng tạo dưới đây nằm **hoàn toàn ở tầng hiển thị client (`src/client/`)**, tự động tắt khi chạy headless nên **không làm thay đổi bất kỳ đầu ra nào của Test Contract v1.0**:

1. **La bàn Đom Đóm Dẫn Đường (`src/client/scene.ts`):** Mũi tên ánh sáng vàng nhỏ xoay quanh chân Mây luôn chỉ về Đèn Lồng Lớn chưa thắp gần nhất, giúp định hướng mượt giữa sương đêm mà không cần minimap rườm rà.
2. **Bầu trời & ánh sáng đảo ấm dần theo tiến độ (`src/client/scene.ts`):** Từ 0/5 đến 5/5 đèn, sương tím đêm dần loãng đi và chuyển sang sắc hoàng hôn ấm áp, kèm bến cầu gỗ Đảo Bến và biển mây trôi quanh đảo.
3. **Âm thanh ngũ cung thủ tục bằng Web Audio API (`src/client/audio.ts`):** Chuông ngũ cung tăng cao độ theo số đom đóm mang và số đèn đã thắp, hoàn toàn không phụ thuộc file âm thanh ngoài và có nút bật/tắt trên HUD.

**Bằng chứng phần lõi không bị ảnh hưởng:** `src/sim/` không import bất kỳ module nào từ `src/client/` (kiểm tra bằng `tsconfig.headless.json` chỉ biên dịch `src/sim/` + `src/headless/`), và toàn bộ 10 unit test + 8 kịch bản contract/determinism trong [`docs/proof/phase-1/contract-report.md`](docs/proof/phase-1/contract-report.md) đều **PASS**.

---

## Hồ sơ SDLC, Harness AI & Bằng chứng

- **Harness AI:** [`AGENTS.md`](AGENTS.md), Skill [`.agents/skills/verify-phase/SKILL.md`](.agents/skills/verify-phase/SKILL.md), CI [`.github/workflows/verify.yml`](.github/workflows/verify.yml)
- **Giả định & Tiêu chí nghiệm thu Phase 1:** [`docs/notes/phase-1-assumptions.md`](docs/notes/phase-1-assumptions.md)
- **Nhật ký dùng AI & Quản lý token:** [`docs/notes/ai-log.md`](docs/notes/ai-log.md)
- **Bằng chứng kiểm chứng Phase 1:** [`docs/proof/phase-1/README.md`](docs/proof/phase-1/README.md) & [`docs/proof/phase-1/contract-report.md`](docs/proof/phase-1/contract-report.md)
- **Tài liệu lab gốc:** [GUIDE.md](GUIDE.md) · [CHECKPOINTS.md](CHECKPOINTS.md) · [SUBMISSION.md](SUBMISSION.md) · [RULES.md](RULES.md) · [RUBRIC.md](RUBRIC.md)
