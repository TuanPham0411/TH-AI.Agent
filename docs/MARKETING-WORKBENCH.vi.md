# Workspace và workflow marketing

Trang chủ là nơi giới thiệu ứng dụng, liệt kê workflow đã lưu, trạng thái lịch,
heartbeat scheduler, AI và kết nối. Chỉ khi tạo hoặc mở workflow mới vào editor.
Điện thoại chỉ có trang quản lý và kết quả; không có canvas thiết kế.

## Hai panel trong editor

- **Panel dưới / Block work:** nội dung của block được chọn. User Input nhận yêu
  cầu cho lượt chạy; Manager nhận nhiệm vụ, phong cách, phương pháp, yêu cầu báo
  cáo và quy tắc phân công. Terminal nhận JavaScript và input thử cục bộ. Block
  tạo ảnh/video nhận creative brief; block dữ liệu nhận query/mapping.
- **Panel phải:** cấu hình, model/provider, giới hạn, lịch, quyền, đích đến và
  kết nối. Nội dung hướng dẫn của Manager được đưa vào runtime model instructions;
  không thay đổi quyền hoặc topology đã duyệt.
- Các tab Run input, Execution trace và Output được giữ để kiểm tra lượt chạy.
  Terminal là sandbox JavaScript, không phải shell hệ điều hành.

## Kết nối nhiều kênh

Mở **Kênh marketing**, thêm tên, platform, Page ID / channel ID / creator open_id
và quyền truy cập của chính kênh đó. Mỗi kênh có private credential riêng;
không dùng chung token giữa các kênh. Xác minh danh tính trước khi chọn kênh vào
Multi-channel Publisher. Việc đổi credential làm hết hiệu lực kiểm tra workflow
và cần Check/lưu lại.

YouTube có thể dùng OAuth client đã lưu trong Connections. Lưu kênh trước, bấm
**Đăng nhập Google cho kênh**, chọn Google/Brand Account phù hợp, rồi xác minh
Channel ID. Consent bao gồm readonly, upload và force-ssl cho comment. Callback
vẫn là `/api/oauth/callback`, được ràng buộc với phiên chủ workspace và PKCE.
Một token không mặc nhiên truy cập được mọi Brand Account.

Facebook cần Page access token và quyền `pages_manage_posts`; bình luận còn cần
quyền tương ứng, thường là `pages_manage_engagement`. TikTok Direct Post cần app
được duyệt, scope và miền media đã xác minh. YouTube/TikTok có yêu cầu audit,
privacy và quota riêng. Danh tính được xác minh không đồng nghĩa mọi quyền ghi
đã được cấp. Các lỗi API được giữ trong kết quả; không giả báo thành công.

## Tạo nội dung, media và đăng

1. Chọn template **Trend → Picture → Channels** hoặc **Trend → Video → Channels**.
2. Trong Auto Input, nhập topic, brand, audience, language, campaignId. Có thể thêm
   `link` HTTPS và `comment` (Facebook/YouTube). Trong block creator, mô tả giọng
   văn, thông điệp, ảnh/video và các ràng buộc thương hiệu ở panel dưới.
3. Cấu hình model và media model đang được tài khoản cho phép. Check, lưu, chạy
   thử với hạn mức đã duyệt. Media job chạy bất đồng bộ; kết quả submitted không
   đồng nghĩa đã có ảnh/video hoàn chỉnh.
4. Tạo **Campaign Delivery** cùng campaignId. Chọn các kênh đã lưu và quyền riêng
   tư trong panel phải của Multi-channel Publisher. Có thể đặt link và bình luận
   riêng cho từng kênh; chúng ưu tiên hơn metadata của media job.
5. Bật Auto với ngân sách/lượt gọi và quyền ghi giới hạn. Delivery tiếp tục từng
   bước từ biên nhận đã lưu: tạo/upload, chờ platform xử lý, xác nhận, bình luận.

Facebook hỗ trợ ảnh/video và bình luận đầu tiên có link. YouTube chỉ nhận video,
chờ xử lý và có thể tạo bình luận đầu tiên. TikTok Content Posting API không
cung cấp API tạo bình luận; link trong caption không được đảm bảo bấm được.
Workflow sẽ từ chối cấu hình comment không được hỗ trợ thay vì giả thực hiện.

Mỗi thao tác ghi lưu intent trước khi gọi API. Nếu kết quả không chắc chắn, hệ
thống không tự đăng lại. Kiểm tra trên nền tảng và review receipt. Retry comment
không tạo lại bài đã đăng. Không có automatic ad spend: tính năng này đăng nội
 dung marketing; cấu hình/chi tiêu chiến dịch Ads là bước riêng.

**Mở trong tab mới** mở website trên trình duyệt đang dùng. Đây không phải một
Chrome tự điều khiển trên SIKA1. Chưa có browser worker/remote desktop dành cho
đăng nhập và tự thao tác Facebook UI; xuất bản unattended hiện đi qua API.

## Lịch chạy và kết thúc

Trong Schedules, chọn interval, daily (tối đa 8 mốc giờ), weekly hoặc once.
Dùng IANA timezone, mặc định Asia/Ho_Chi_Minh. Một lần cần timestamp có UTC offset.
Mỗi tick claim một workflow trước khi chạy; worker không chạy chồng. Khi lượt chạy
kết thúc, không còn vòng lặp agent; lịch server gọi lượt tiếp theo. Mốc bị bỏ lỡ
không được chạy bù dồn; one-time hết hạn không tạo lượt mới. DST không chạy lại
cùng mốc giờ địa phương trong ngày. Auto quotas tính theo UTC như màn hình Auto.

Owner workspace hiện có quyền thực thi trên server. Thành viên chỉ có bản thiết
kế và dữ liệu riêng; không quảng cáo quyền chạy/publish cho tài khoản chưa được
hệ thống hỗ trợ. Cần cấu hình provider và duyệt quyền trước khi đăng thật.

## Kiểm thử bản thay đổi

`npm test` chạy kiểm thử logic/API. Để chạy cả PostgreSQL integration, đặt
`TEST_DATABASE_URL` trỏ tới database thử riêng rồi chạy lại; các test có ghi/xóa
bảng thử, không dùng database production. `npm run build && npm run test:browser`
kiểm tra editor, sandbox, trang chủ và panel theo block bằng Chromium cài sẵn
(`CHROMIUM_PATH` nếu cần). API mạng xã hội trong test dùng fixture: không tạo bài
thật và không xác nhận rằng các kênh production đã được cấp quyền.
