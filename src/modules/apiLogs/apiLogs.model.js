var { mongoose } = require('../config/db');

const exampleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      index: true,
    },
  },
  {
    collection: 'Example',
    timestamps: true,
  }, // Lưu trữ trong collection 'results' và thêm timestamp tự động.
);
let mongodLogModel = mongoose.model('Example', exampleSchema);

module.exports = { mongodLogModel };
