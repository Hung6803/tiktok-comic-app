# TikTok Comic Generator

Tạo truyện tranh TikTok tự động với AI - Sử dụng **DeepSeek** cho cốt truyện và **Gemini** cho hình ảnh.

## Tính năng

- **DeepSeek AI**: Tạo cốt truyện chi tiết, đối thoại, và image prompts
- **Gemini 2.0 Flash**: Tạo hình ảnh chất lượng cao cho từng panel
- **8 thể loại**: Tình cảm, Kinh dị, Hài hước, Hành động, Bí ẩn, Kỳ ảo, Drama, Đời thường
- **6 phong cách vẽ**: Manga, Manhwa, Manhua, Webtoon, Chibi, Realistic
- **Single Story**: Tạo truyện đơn lẻ (3-50 panels)
- **Series Mode**: Tạo series nhiều tập (3-200 episodes)
- **Quản lý nhân vật**: Giữ nhất quán ngoại hình xuyên suốt truyện
- **Regenerate**: Tạo lại từng panel riêng lẻ
- **Ad Generator**: Tạo comic quảng cáo sản phẩm
- **Export**: Xuất story và panels ra ZIP/JSON

## Cài đặt

```bash
# Cài đặt dependencies
npm install

# Chạy server (production)
npm start

# Chạy server (development với auto-reload)
npm run dev
```

Truy cập: **http://localhost:3002**

## Lấy API Keys

### DeepSeek API Key
1. Truy cập [platform.deepseek.com](https://platform.deepseek.com)
2. Đăng ký/Đăng nhập
3. Vào API Keys → Create new key
4. Copy key (bắt đầu bằng `sk-...`)

### Gemini API Key
1. Truy cập [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. Đăng nhập Google account
3. Click "Create API Key"
4. Copy key (bắt đầu bằng `AIza...`)

## Cấu trúc project

```
tiktok-comic-app/
├── server.js          # Backend Express server
├── package.json       # Dependencies
├── public/
│   └── index.html     # Frontend SPA
└── data/
    └── stories.json   # Story storage
```

## API Endpoints

| Endpoint | Method | Mô tả |
|----------|--------|-------|
| `/api/deepseek` | POST | Proxy tới DeepSeek API |
| `/api/gemini-text` | POST | Proxy tới Gemini 3 Pro |
| `/api/gemini` | POST | Tạo hình ảnh Gemini |
| `/api/stories` | GET | Lấy tất cả stories |
| `/api/stories/:id` | GET/DELETE | Lấy/Xóa story |
| `/api/stories` | POST | Lưu story |
| `/api/health` | GET | Health check |

## Deploy

### Deploy lên VPS/Server

```bash
# Clone project
git clone <repo-url>
cd tiktok-comic-app

# Cài đặt
npm install --production

# Chạy với PM2 (recommended)
npm install -g pm2
pm2 start server.js --name "comic-generator"
pm2 save
pm2 startup
```

### Biến môi trường

| Biến | Mặc định | Mô tả |
|------|----------|-------|
| `PORT` | 3002 | Port server |

### Deploy lên các nền tảng

**Render.com:**
- Build Command: `npm install`
- Start Command: `npm start`

**Railway:**
- Tự động detect Node.js

**Heroku:**
```bash
heroku create
git push heroku main
```

## Lưu ý

- **Rate limiting**: Gemini có giới hạn requests/phút, app tự động delay 2s giữa mỗi panel
- **API costs**: DeepSeek và Gemini có thể tính phí theo usage
- **Storage**: Stories được lưu trong `data/stories.json`

## License

MIT License
