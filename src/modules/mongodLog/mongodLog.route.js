const express = require('express');
const router = express.Router();
const ctl = require('./mongodLog.controller');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Cấu hình Multer để lưu file vào thư mục `uploads`
const uploadDirectory = path.join(__dirname, 'uploads');

// Kiểm tra và tạo thư mục nếu chưa tồn tại
if (!fs.existsSync(uploadDirectory)) {
  fs.mkdirSync(uploadDirectory, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDirectory);
  },
  filename: (req, file, cb) => {
    // Thêm timestamp vào tên file để tránh trùng lặp
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    cb(null, `${basename}-${uniqueSuffix}${extension}`);
  },
});
const upload = multer({ storage });

router.post('/', upload.single('file'), ctl.analyzeLogData);

router.get('/test', ctl.testRunLog);

module.exports = router;
