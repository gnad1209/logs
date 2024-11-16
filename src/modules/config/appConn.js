require('dotenv').config();
const mongoose = require('mongoose');
const uri = process.env.DATABASE || `mongodb://127.0.0.1:27017/example`;

const connection = mongoose.createConnection(uri);

connection.on('connected', () => {
  console.log('Kết nối tới cơ sở dữ liệu MongoDB thành công.');
});

connection.on('error', (err) => {
  console.error('Lỗi khi kết nối tới cơ sở dữ liệu MongoDB:', err);
});

connection.on('disconnected', () => {
  console.log('Đã ngắt kết nối từ cơ sở dữ liệu MongoDB.');
});

module.exports = connection;
