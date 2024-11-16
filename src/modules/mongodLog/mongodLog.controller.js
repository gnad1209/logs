const service = require("./mongodLog.service");
const fs = require("fs-extra");
const path = require("path");

const analyzeLogData = async (req, res, next) => {
  try {
    // upload file mongod.log
    // Kiểm tra xem file có được tải lên hay không
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Không có file nào được upload." });
    }
    console.log(`Đã upload thành công`);

    // Đường dẫn file ban đầu
    const originalFilePath = path.join(__dirname, "uploads", req.file.filename);
    // Đổi đuôi file thành .json
    const jsonFilePath = originalFilePath.replace(
      path.extname(originalFilePath),
      ".json"
    );

    // Đổi tên file
    await fs.promises.rename(originalFilePath, jsonFilePath);
    console.log(`Đã đổi tên file thành JSON `);

    //import dữ liệu từ file mongod.log vào db
    if (await service.importLogData(jsonFilePath)) {
      console.log("Dữ liệu đã được nhập thành công vào DB");
    }

    // xóa file mongod.log
    if (await service.deleteFileIfExists(jsonFilePath)) {
      console.log(`Đã xóa file `);
    }

    console.log(`bắt đầu phân tích`);
    const [msgNsPercentages] = await Promise.all([
      service.msgNsPercentages(req),
    ]);

    console.log(`bắt đầu tính toán`);
    if (msgNsPercentages) {
      const resultsTotal = await service.resultsTotal(msgNsPercentages);

      console.log(`bắt đầu ghi dữ liệu vào excel`);
      const pathXlsx = await service.writeToExcel(resultsTotal);

      console.log(`bắt đầu upload tạo file tải về`);
      const linkExcell = await service.uploadFileExcell(pathXlsx);

      // xóa file excel khi được up xong
      if (await service.deleteFileIfExists(pathXlsx)) {
        console.log(`Đã xóa file excel sau khi upload xong`);
      }
      console.log("linkExcell.url:", linkExcell.url);

      return res.json({
        success: true,
        url: linkExcell.url,
        // resultsTotal: resultsTotal || [],
        // percentages: msgNsPercentages,
      });
    }

    return res.json({ status: false, message: "No data found" });
  } catch (error) {
    console.error("Error occurred:", error);
    return res.json({ success: false, message: error.message });
  }
};

const testRunLog = async (req, res, next) => {
  try {
    var DATABASE_COLLECTION = "";

    // Kiểm tra trạng thái kết nối của MongoDB
    if (service.mongod_log.db.readyState !== 1) {
      return res.json({
        success: false,
        message: "Kết nối cơ sở dữ liệu chưa được thiết lập.",
      });
    }

    const collectionName = service.mongod_log.collection.name;
    if (collectionName) {
      DATABASE_COLLECTION = collectionName;
    }
    // Kiểm tra xem collection `mongo_logs` có tồn tại hay không
    const collections = await service.mongod_log.db.db
      .listCollections()
      .toArray();
    const mongoLogsExists = collections.some(
      (col) => col.name === DATABASE_COLLECTION
    );

    if (!mongoLogsExists) {
      return res.json({
        success: false,
        message: `Bảng dữ liệu ${DATABASE_COLLECTION} không tồn tại.`,
      });
    }

    // Nếu collection tồn tại, đếm số lượng bản ghi
    const recordCount = await service.mongod_log.countDocuments();

    if (recordCount === 0) {
      return res.json({
        success: false,
        message: `Bảng dữ liệu ${DATABASE_COLLECTION} được kết nối và không có bản ghi log nào.`,
      });
    }
    return res.json({
      success: true,
      message: `Bảng dữ liệu ${DATABASE_COLLECTION} được kết nối và có bản ghi, tool phân tích đã sẵn sàng, chạy ${
        req.protocol
      }://${req.headers.host}/api/log để lấy kết quả ${Date.now()}.`,
      recordCount: recordCount,
    });
  } catch (error) {
    return res.json({ success: false, message: error.message });
  }
};

module.exports = {
  analyzeLogData,
  testRunLog,
};
