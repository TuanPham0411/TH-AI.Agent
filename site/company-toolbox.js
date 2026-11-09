import {catalog,newNode} from './workflow-model.js';
import {blockConnectionState} from './connection-state.js';
export const toolFamilies=[
 {id:'communication',name:'Giao việc & Phản hồi',icon:'tasks',description:'Yêu cầu, dữ liệu đính kèm, trao đổi và bàn giao.',types:['chat','output','report']},
 {id:'management',name:'Quản lý & Điều phối',icon:'person',description:'Nhận việc, lập kế hoạch, phân công và báo cáo theo cấp.',types:['manager','leader','agent','supervisor','reviewer','procedure','memory']},
 {id:'production',name:'Tác vụ chuyên môn',icon:'media',description:'Nội dung, ảnh, âm thanh, video và báo cáo.',types:['content_agent','script_agent','text_to_image','text_to_audio','text_to_video','image_to_video','rows_export','chart_report','stats','market_report','srv_gmail_send','srv_resend_email','srv_ms_email']},
 {id:'monitoring',name:'Giám sát & An toàn',icon:'shield',description:'Cấu trúc, bằng chứng, thời gian, lỗi và các dấu hiệu cần kiểm tra.',types:['quality_check','rows_validate','reviewer','supervisor','information']},
 {id:'logic',name:'Logic & Hệ thống',icon:'workflow',description:'Điều kiện, nhánh, auto, delay, timer và lịch hẹn.',types:['auto_input','timer','delay','if_else','logic_or','logic_and','switch','for_each','limit','dedupe','action','parse_json']},
 {id:'data',name:'Cơ sở dữ liệu',icon:'chart',description:'Truy vấn có giới hạn và xử lý dữ liệu thực tế.',types:['database','db_odbc','db_mysql','db_sqlserver','db_oracle','db_mongo','db_firestore','csv_read','rows_filter','rows_map','rows_join','rows_aggregate']},
 {id:'network',name:'Trình duyệt & Kết nối nội bộ',icon:'link',description:'Trang web, HTTP/PHP, intranet và file được cấp quyền.',types:['browser_link','source_http','source_media','file_list','file_read','function']},
 {id:'platforms',name:'Mạng xã hội & Nền tảng số',icon:'social',description:'Kênh được cấp quyền, xuất bản và kết nối thương mại.',types:['social_publish','srv_facebook_post','srv_facebook_photo','srv_youtube_videos','srv_tiktok_account','srv_threads_create','srv_instagram_media','srv_shopee_products','srv_tiktokshop_products','srv_shopify_products','srv_woo_orders','srv_x_post','srv_lazada_products']}
];
export const integrationNotes=[
 {id:'access',name:'Microsoft Access',family:'data',nodeType:'db_odbc',note:'Dùng ODBC gateway với DSN và driver Access trên máy có driver tương thích. Không giả lập driver Access trên Raspberry Pi.'},
 {id:'php',name:'PHP / API nội bộ',family:'network',nodeType:'source_http',note:'Gọi HTTPS endpoint trả JSON/text. PHP là dịch vụ nguồn, không phải một model AI. Intranet cần allowlist origin trên server.'},
 {id:'folders',name:'Local folder / Local files',family:'network',nodeType:'file_list',note:'Chỉ đọc thư mục được operator mount và đặt WORKSPACE_FILES_ROOT. Không tự truy cập toàn bộ filesystem của server.'},
 {id:'workorder',name:'Workorder / nghiệp vụ nội bộ',family:'platforms',note:'Mỗi hệ thống workorder có API khác nhau. Cần origin, tài liệu API và quyền của hệ thống cụ thể; có thể cài HTTPS add-in đã được duyệt.'}
];
export function toolAvailability(type,credentials={}){if(['file_list','file_read'].includes(type))return {state:'configured',label:'Cần workspace mount',detail:'Operator cấp thư mục đọc rõ ràng; không tự truy cập server.'};if(type==='browser_link')return {state:'local',label:'Mở bằng thao tác người dùng',detail:'Không có Chrome worker tự điều khiển server.'};if(!catalog[type])return {state:'extension',label:'Cần tích hợp'};const state=blockConnectionState(newNode(type),credentials);return {state:state.state,label:state.state==='local'?'Xử lý cục bộ':state.state==='verified'?'Kết nối đã xác minh':state.state==='configured'?'Cần xác minh':'Cần cấu hình',detail:state.label};}
