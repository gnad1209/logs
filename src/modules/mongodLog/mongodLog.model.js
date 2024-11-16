const mongoose = require("mongoose");

const mongodLogShema = new mongoose.Schema(
  {
    t: { type: Date, required: true }, // Trường t chứa thời gian
    s: { type: String, required: true }, // Trường s chứa loại thông điệp
    c: { type: String, required: true }, // Trường c chứa loại điều khiển
    id: { type: Number, required: true }, // Trường id chứa mã số
    ctx: { type: String, required: true }, // Trường ctx chứa ngữ cảnh
    msg: { type: String, required: true }, // Trường msg chứa thông điệp
    attr: { type: Object }, // Trường attr chứa các thông tin bổ sung (nếu có)
  },
  {
    collection: "mongo_logs3",
  }
);

module.exports = mongoose.model("mongod_log_model", mongodLogShema);
