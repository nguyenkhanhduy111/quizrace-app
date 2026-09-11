# QuizRace — Đố vui trực tiếp kiểu Kahoot

Web app cho người tổ chức (Host) tạo bộ câu hỏi, mở phòng bằng mã PIN, và người chơi
tham gia bằng điện thoại để trả lời trực tiếp, có chấm điểm theo thời gian và bảng xếp hạng.

**Công nghệ:** React + Vite (frontend, host trên Netlify) + Supabase (đăng nhập Host,
cơ sở dữ liệu Postgres, và realtime để đồng bộ Host ↔ Player).

> Netlify chỉ host được phần frontend tĩnh, không giữ được kết nối lâu dài (WebSocket)
> cho một server tự viết — vì vậy phần "máy chủ" ở đây dùng Supabase (đã có sẵn realtime
> + tính điểm được thực hiện bằng hàm Postgres phía server, không phải trên trình duyệt
> người chơi) thay vì bạn phải tự vận hành một backend riêng.

## 1. Tạo dự án Supabase (miễn phí)

1. Vào https://supabase.com → **New project**.
2. Đợi project khởi tạo xong, vào **SQL Editor** → **New query**.
3. Mở file [`supabase/schema.sql`](./supabase/schema.sql) trong repo này, copy toàn bộ nội dung,
   dán vào SQL Editor rồi bấm **Run**. Lệnh này tạo toàn bộ bảng, view, hàm chấm điểm
   và chính sách bảo mật (RLS).
4. Vào **Project Settings → API**, lấy 2 giá trị:
   - `Project URL`
   - `anon public` key

## 2. Chạy thử ở máy local

```bash
npm install
cp .env.example .env
# Mở .env, dán Project URL và anon key vừa lấy ở bước 1
npm run dev
```

Mở `http://localhost:5173`. Vào **Đăng nhập Host** để tạo tài khoản Host đầu tiên
(email/mật khẩu do Supabase Auth quản lý).

## 3. Đưa code lên GitHub

```bash
git init
git add -A
git commit -m "QuizRace: khởi tạo dự án"
gh repo create quizrace --public --source=. --push
# hoặc tạo repo thủ công trên github.com rồi:
# git remote add origin https://github.com/<ten-ban>/quizrace.git
# git push -u origin main
```

## 4. Deploy lên Netlify

1. Vào https://app.netlify.com → **Add new site → Import an existing project**.
2. Chọn repo GitHub vừa tạo.
3. Netlify tự đọc cấu hình từ `netlify.toml` (build command `npm run build`, thư mục
   publish `dist`) — không cần chỉnh gì thêm.
4. Vào **Site configuration → Environment variables**, thêm:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   (đúng 2 giá trị lấy ở bước 1)
5. Bấm **Deploy site**. Sau khi build xong, bạn có một domain dạng
   `https://ten-site.netlify.app` — dùng domain này để Host mở phòng và Player quét QR tham gia.

Mỗi khi bạn `git push` lên nhánh chính, Netlify tự build và deploy lại.

## 5. Những gì đã có trong phiên bản này

Theo đúng phạm vi "phiên bản đầu tiên" đã mô tả:

- Đăng nhập/đăng ký Host (Supabase Auth).
- Thư viện bộ câu hỏi: tạo, sửa, xóa; mỗi câu hỏi có 2–4 đáp án, 1 đáp án đúng,
  thời gian (10/20/30/60s), điểm tối đa, ảnh minh họa và giải thích tùy chọn.
- Kiểm tra hợp lệ trước khi tổ chức trò chơi (không cho thiếu nội dung/đáp án/đáp án đúng).
- Tạo phòng với mã PIN 6 số + mã QR; khi bắt đầu phiên, hệ thống **sao chép** nội dung
  bộ câu hỏi sang phiên chơi để việc sửa bộ câu hỏi gốc không ảnh hưởng trận đang chạy.
- Người chơi vào phòng bằng mã hoặc quét QR, đặt tên hiển thị (tự thêm số nếu trùng tên).
- Luồng chơi thời gian thực: đếm ngược → câu hỏi (đồng hồ đếm ngược, số người đã trả lời)
  → công bố đáp án (biểu đồ số người chọn từng phương án) → bảng xếp hạng → câu tiếp theo
  → kết quả chung cuộc (top 3 + toàn bộ bảng xếp hạng).
- Chấm điểm **trên máy chủ** (hàm Postgres `submit_answer`, không phải trình duyệt người
  chơi): đúng thì càng trả lời sớm càng nhiều điểm, sai/không trả lời = 0 điểm.
- Đáp án đúng chỉ lộ ra sau khi Host công bố (chặn bằng RLS ở tầng cơ sở dữ liệu).
- Khôi phục phiên khi người chơi tải lại trang (lưu vào `sessionStorage`).
- Host có thể xóa người chơi khỏi phòng và khóa phòng trong lúc chờ.

## 6. Giới hạn đã biết của bản MVP (có thể mở rộng sau)

- **Đồng hồ câu hỏi do trình duyệt Host tạo mốc thời gian** (không phải một server luôn
  chạy nền) — nếu Host mất mạng/đóng tab giữa câu hỏi, đồng hồ dừng cho tới khi Host quay
  lại, đúng như hành vi mô tả trong tài liệu gốc, nhưng cũng có nghĩa Host cần giữ tab mở
  trong suốt trận.
- Người chơi không cần tài khoản, nên không có cơ chế chống một người mở nhiều tab để
  trả lời nhiều lần dưới các tên khác nhau — phù hợp quy mô lớp học/nhóm nhỏ, chưa phù hợp
  để tổ chức thi có tính điểm cao/giải thưởng.
- Trường `explanation` (giải thích) hiện hiển thị công khai cùng lúc với các trường khác
  của câu hỏi ở tầng dữ liệu thô; giao diện chỉ hiển thị nó sau khi công bố đáp án, nhưng
  một người có kỹ thuật đọc thẳng API vẫn có thể thấy trước — chấp nhận được cho bản đầu,
  có thể siết chặt thêm bằng cách chuyển `explanation` sang một RPC riêng nếu cần.
- Chưa có: chơi theo đội, ngân hàng câu hỏi công khai, tạo câu hỏi bằng AI, gói trả phí —
  đúng như mục "bổ sung sau" trong phạm vi phiên bản đầu.

## 7. Cấu trúc thư mục

```
src/
  lib/            supabaseClient, AuthContext, helpers (mã PIN, lưu phiên người chơi)
  components/     ShapeIcon, HostNav, RequireHost
  pages/
    Home.jsx          Trang chủ (ô nhập mã phòng)
    HostLogin.jsx      Đăng nhập / đăng ký Host
    QuizLibrary.jsx    Thư viện bộ câu hỏi
    QuizEditor.jsx     Soạn câu hỏi
    HostSession.jsx    Điều khiển trận (phòng chờ → câu hỏi → kết quả)
    Join.jsx           Người chơi nhập mã + tên
    Play.jsx           Màn hình người chơi trong trận
supabase/
  schema.sql       Toàn bộ bảng, view, hàm chấm điểm và RLS — chạy 1 lần trong Supabase
```
