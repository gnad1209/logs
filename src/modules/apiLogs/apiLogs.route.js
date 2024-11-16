const router = require('express').Router();
const apiLogsCtrl = require('./apiLogs.controller');
const multer = require('multer');
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, `src/files/`);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now() * 1}___${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 * 1024 },
});

router.post('/', upload.array('file'), apiLogsCtrl.apiLogs);

module.exports = router;
