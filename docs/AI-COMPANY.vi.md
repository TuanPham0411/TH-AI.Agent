# Công ty dịch vụ AI · Thiên Hà

Giao diện điều hành lấy con người làm Tổng Giám đốc. Giám đốc điều phối AI nhận
mục tiêu, chia việc cho Trưởng phòng; nhân viên và công cụ báo cáo lại cho đúng
người giao. Kiểm soát chất lượng đánh giá các báo cáo Trưởng phòng trước khi
Giám đốc điều phối bàn giao kết quả. Mô hình này dùng runtime tổ chức thật, không
phải một sơ đồ nhân sự chỉ để trình bày.

## Không gian làm việc

- **Trụ sở công ty:** mô hình kiến trúc 2.5D tự vẽ bằng SVG, chọn trực tiếp tám
  phòng ban, dịch vụ, số liệu từ công việc thực tế và dòng bàn giao.
- **Công việc:** hồ sơ giao việc, trạng thái tiếp nhận/thực thi/bị chặn, phản hồi.
- **Phòng ban & Nhân sự:** chức năng, đầu ra và chuỗi trách nhiệm; đội hình được
  tạo theo nhu cầu, không giả hiển thị nhân viên đang chạy khi chưa có lượt chạy.
- **Kho công cụ:** công cụ thực thi, trạng thái kết nối và điều kiện tích hợp.
- **Giám sát:** heartbeat, worker, lỗi, checkpoint và trace thực tế.
- **Báo cáo:** kết luận điều hành, đánh giá QA, file và biểu đồ thực sự được tạo.
- **Quy trình:** giữ toàn bộ workflow cũ; editor chỉ mở khi tạo/mở quy trình.

Tám phòng gồm Chiến lược & Kịch bản, Phân tích & Kỹ thuật, Dữ liệu & Báo cáo,
Sáng tạo & Nội dung, Studio Đa phương tiện, Marketing & Kênh số, Vận hành &
Tích hợp, Giám sát & An toàn. Một yêu cầu chọn 1–3 phòng để giới hạn phạm vi.
Đội hình mặc định có tối đa 32 model calls, hai nhánh song song và tám phút;
quyền của từng vai trò và phê duyệt của người dùng vẫn được runtime kiểm tra.

## Giao việc và thực thi

1. Đăng nhập workspace chủ. Chọn dịch vụ hoặc Giao việc mới.
2. Nhập tiêu đề, yêu cầu, JSON và link HTTPS nếu có. File được tải theo từng
   phần, chỉ gắn vào hồ sơ sau khi lưu được xác nhận. Tối đa năm file, 16 MB/file;
   AI có giới hạn đọc thấp hơn và giới hạn loại file tùy provider/model.
3. Chọn phòng ban, provider và model từ quyền truy cập tài khoản. Lưu tạo hồ sơ
   và workflow trong cùng giao dịch Drive-first. Lưu chưa gọi model, chưa tính phí.
4. Xem điều kiện kết nối và đầu vào. Xác minh model/connector trong Connections;
   cấu hình công cụ chuyên môn, model media hoặc đích đến còn thiếu trong editor.
5. Phê duyệt chi phí trước khi chạy; quyền ghi/xuất bản/gửi email là tùy chọn riêng.
   Công việc không có quyền ghi không thể tự mở rộng quyền qua quyết định AI.
6. Xem báo cáo, trace và giới hạn còn vướng. Runtime hoàn tất không tự đồng nghĩa
   mục tiêu hoàn tất: `blocked` và `partial` vẫn được hiển thị như vậy. Giám đốc
   không thể báo completed khi chưa có báo cáo các phòng được giao và QA tương ứng.
7. Gửi phản hồi text/file/JSON. Lượt tiếp theo nhận phản hồi gần nhất và ngữ cảnh
   kết quả trước; cần xác nhận đúng run ID đã xem để tránh chạy trùng do tab cũ.

Bấm chạy lại cần kiểm tra các tác động bên ngoài của lượt trước. Hệ thống không
bỏ qua biên nhận và không tự phát lại các thao tác chưa xác nhận. Một request
khởi chạy được gửi lặp lại sẽ trả lại lượt chạy hiện có thay vì tạo bản trùng.

## Công cụ và giới hạn thực tế

- Biểu đồ cột/đường xuất SVG từ số liệu thật, hỗ trợ giá trị âm/0, nhãn được escape.
  Không tạo số liệu minh họa rồi coi là báo cáo thực tế. Kiểm tra chất lượng mới
  là kiểm tra cấu trúc/kích thước/nội dung chủ động; không phải chứng nhận an ninh.
- Delay có thể hủy trong 1–30.000 ms. Timer/auto và lịch IANA tiếp tục dùng scheduler.
- Tạo âm thanh thêm `Text → Audio` qua Replicate. Cần chọn model thực tế và input
  theo schema của model. Media chạy bất đồng bộ; submitted không đồng nghĩa hoàn tất.
- X có read profile và create post bằng user-context OAuth. Lazada Vietnam có
  product catalog đọc qua chữ ký Open Platform. Cần app/plan/quyền của provider;
  không giả rằng đã được cấp quyền. Các API test dùng fixture, không đăng bài thật.
- Access dùng ODBC gateway/DSN với driver tương thích trên máy gateway. PHP là
  HTTPS data source; MySQL/SQL Server/Oracle/MongoDB/Firestore dùng connector có sẵn.
- File/folder nội bộ chỉ được đọc khi operator mount thư mục và đặt
  `WORKSPACE_FILES_ROOT`. Chặn đường dẫn tuyệt đối, `..`, symlink ra ngoài và file
  nhị phân/quá giới hạn. Không mount toàn bộ `/` hoặc thư mục credentials.
- `Mở trang để duyệt` trả link HTTPS để người dùng mở bằng thao tác trực tiếp.
  Bản này không có Chrome worker tự điều khiển Facebook/website trên server.
- Workorder bên ngoài cần xác định hệ thống/API cụ thể; HTTPS add-in dùng origin
  và quyền đã duyệt. Mục này ghi rõ điều kiện thay vì hiển thị kết nối giả.

Owner workspace có thực thi server. Firebase members vẫn chỉ có workspace thiết
kế riêng; không cấp ngầm quyền thực thi/quyền dữ liệu của Tổng Giám đốc.
Điện thoại giữ chức năng theo dõi, xem kết quả và quản lý lịch; thiết kế đội hình
và tạo yêu cầu trên máy tính. Bộ test browser kiểm tra giao diện bằng API fixture;
PostgreSQL integration kiểm tra hồ sơ/workflow/phản hồi tồn tại qua router mới.
