# TH · AI Workspace

Ứng dụng AI độc lập tại `ai.th.io.vn`, tham khảo kiến trúc MES `TuanPham0411/Thien-Ha` tại commit `66aa6e527d496679e3941eae02587e17660940ff`.

Bản nền tảng dùng JavaScript/CSS, Vite, Node.js 22, Express 5 và PostgreSQL. Có giao diện tối mặc định, bố cục di động, Việt/Anh, lựa chọn giao diện lưu trên trình duyệt và các trang trống. Không có dữ liệu mẫu giả hoạt động, chức năng AI, đăng nhập, phân quyền hoặc SSO. Chưa tạo tài khoản owner và không sử dụng cookie `th_mes`.

## Phát triển

```sh
cd /workspace/TH-Agent
# Dùng Node.js 22 theo .nvmrc
npm ci
npm test
npm run build
npm run dev:server
# Terminal khác, cùng thư mục:
npm run dev
```

Vite proxy `/api` tới `127.0.0.1:3100`. API health tại `/api/health`; `/api/ready` trả 503 nếu PostgreSQL/migration chưa sẵn sàng. Không cần khóa AI cho bản này. Không có API dữ liệu riêng tư; phải triển khai xác thực và kiểm tra quyền phía server trước khi thêm dữ liệu/nghiệp vụ.

Đặt `DATABASE_URL` của database phát triển riêng qua cấu hình cục bộ an toàn, chạy `npm run migrate`. Migration hiện tại chỉ tạo bảng phiên bản. Kiểm thử tích hợp dùng `TEST_DATABASE_URL` của database test dùng riêng, chạy `npm test`; nếu thiếu biến, bài test database được báo bỏ qua.

Xem [triển khai](deploy/README.md) và [kiến trúc hiện tại](docs/architecture.vi.md).
