const mongod_log = require("./mongodLog.model");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const axios = require("axios");
const https = require("https");
const mongoose = require("mongoose");
const readline = require("readline");

const {
  createPipelineMsgCounts,
  createPipelineNsCounts,
  createPipelineStatistics,
  createPipelineResults,
  createPipelineResultsTotal,
} = require("./mognodLog.pipeline");

const finData = async (req) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const { commandTypes, ns, s, c, ctx, msg } = req.query;
    const filter = {
      ...(commandTypes && { "attr.type": commandTypes }),
      ...(ns && { "attr.ns": ns }),
      ...(s && { s: s }),
      ...(c && { c: c }),
      ...(ctx && { ctx: ctx }),
      ...(msg && { msg: msg }),
    };

    // Lấy dữ liệu theo filter
    const data = await mongod_log
      .find(filter, "_id")
      .skip(skip)
      .limit(limit)
      .exec();

    if (data.length > 0) {
      return {
        status: true,
        data: data || [],
      };
    }
    return { message: "No data found" };
  } catch (error) {
    console.error("Error in finData:", error);
    return { status: false, error: error.message };
  }
};
/**
 * Hàm tính toán tổng số lượng bản ghi và phần trăm từ các điều kiện lọc trong log.
 *
 * @param {Object} msgNsPercentages - Đối tượng chứa các tỉ lệ phần trăm theo message và namespace.
 * @returns {Object} - Đối tượng chứa kết quả tổng hợp với thông tin về số lượng và phần trăm của các trường lọc.
 */
const resultsTotal = async (msgNsPercentages) => {
  try {
    // Đếm tổng số bản ghi trong bộ sưu tập mongodLog
    const totalRecords = await mongod_log.countDocuments({
      msg: "Slow query",
    });
    // console.log("🚀 ~ resultsTotal ~ totalRecords:", totalRecords);
    const totalResult = {}; // Đối tượng để lưu trữ kết quả tổng hợp

    // Duyệt qua từng namespace trong msgNsPercentages
    for (const ns in msgNsPercentages.nsPercentages) {
      totalResult[ns] = {}; // Khởi tạo đối tượng cho từng namespace
      // Tạo pipeline cho việc truy vấn
      const pipeline = createPipelineResultsTotal("Slow query", ns);
      // Thực hiện truy vấn aggregate theo pipeline
      const results = await mongod_log.aggregate(pipeline);
      // console.log("🚀 ~ resultsTotal ~ results:", JSON.stringify(results));
      // Lấy kết quả đầu tiên nếu có, nếu không thì khởi tạo giá trị mặc định
      const response =
        results.length > 0 ? results[0] : { totalRecords: 0, filterFields: {} };
      const formattedResult = []; // Mảng để lưu trữ kết quả đã định dạng

      // Hàm để tính phần trăm trên tổng số bản ghi
      const percentageOnTotalRecords = (count) =>
        ((count / totalRecords) * 100).toFixed(6);

      // Kiểm tra nếu filterFields tồn tại và là một đối tượng
      if (response.filterFields && typeof response.filterFields === "object") {
        // Duyệt qua từng trường trong filterFields
        for (const [key, value] of Object.entries(response.filterFields)) {
          if (value !== undefined && value !== null) {
            // Định dạng chi tiết cho trường lọc
            const detailedFilter = formatFilterField(key, value);

            if (detailedFilter) {
              // Định dạng kết quả theo yêu cầu
              formattedResult.push({
                attr: `${key} : ${percentageOnTotalRecords(value.count)}%`, // Tạo chuỗi hiển thị phần trăm
                value, // Dữ liệu trong $or hoặc $and
              });
            }
          }
        }
      }

      // Nếu có kết quả đã định dạng, lưu vào totalResult
      if (formattedResult.length > 0) {
        totalResult[ns]["Slow query"] = formattedResult;
      }
    }

    // Trả về kết quả tổng hợp
    return totalResult;
  } catch (error) {
    // Xử lý lỗi và trả về thông báo lỗi
    console.error("Error in resultsTotal:", error);
    return { status: false, error: error.message };
  }
};

// Hàm để duyệt qua tất cả các trường và phần tử của $and, $or và hiển thị toàn bộ
const formatFilterField = (key, value) => {
  if (value === undefined || value === null) {
    return null; // Bỏ qua nếu giá trị không hợp lệ
  }

  if (typeof value === "object" && value !== null) {
    // Kiểm tra và xử lý các điều kiện $and và $or
    if (value.$and) {
      return `$and: [${value.$and
        .map((condition) =>
          formatFilterField(
            Object.keys(condition)[0],
            condition[Object.keys(condition)[0]]
          )
        )
        .join(", ")}]`;
    } else if (value.$or) {
      return `$or: [${value.$or
        .map((condition) =>
          formatFilterField(
            Object.keys(condition)[0],
            condition[Object.keys(condition)[0]]
          )
        )
        .join(", ")}]`;
    } else {
      // Nếu là một trường thông thường
      return `${key}: ${JSON.stringify(value)}`;
    }
  } else {
    // Nếu giá trị là đơn giản (string, number, v.v.)
    return `${key}: ${value}`;
  }
};

const resultsQuery = async (req) => {
  try {
    const { ns, msg } = req.query;

    const results = await mongod_log.aggregate(createPipelineResults(msg, ns));
    const count = await mongod_log.countDocuments();

    const response =
      results.length > 0
        ? results[0]
        : { totalCodes: 0, totalRecords: 0, percentage: 0 };

    const percentageOnTotalRecords = (response.totalCodes / count) * 100;

    return {
      msg: `kết quả của ${msg} từ ${ns} có filter.code là : ${
        response.totalCodes
      } chiến: ${percentageOnTotalRecords.toFixed(
        2
      )}% trong tổng số ${count} bản ghi`,
      // results_response: response,
      percentageOnTotalRecords: {
        formattedTotalRecords_vi: `${percentageOnTotalRecords.toFixed(2)} %`,
        totalRecordsPercentage: percentageOnTotalRecords,
        totalCodes: response.totalCodes,
        totalRecords: count,
      },
    };
  } catch (error) {
    console.error("Error in finData:", error);
    return { status: false, error: error.message };
  }
};
const msgNsPercentages = async (req) => {
  try {
    // lấy tổng số bản ghi
    const totalRecords = await mongod_log.countDocuments();
    //  lấy dữ liệu msg ns theo pipeline
    // const [msgCounts, nsCounts] = await Promise.all([
    //   mongod_log
    //     .aggregate(createPipelineMsgCounts(totalRecords))
    //     .allowDiskUse(true)
    //     .exec(),
    //   mongod_log
    //     .aggregate(createPipelineNsCounts(totalRecords))
    //     .allowDiskUse(true)
    //     .exec(),
    // ]);
    const msgCounts = await mongod_log
      .aggregate(createPipelineMsgCounts(totalRecords))
      .allowDiskUse(true)
      .exec();
    // console.log("🚀 ~ ok2");

    async function getNsCountsInBatches(batchSize) {
      let nsCounts = []; // Lưu trữ kết quả cuối cùng
      let skip = 0; // Số bản ghi đã xử lý

      while (true) {
        // Tạo pipeline với limit và skip để lấy từng batch
        const pipeline = [
          { $skip: skip },
          { $limit: batchSize },
          ...createPipelineNsCounts(totalRecords), // Áp dụng pipeline đã định nghĩa
        ];

        // Thực hiện aggregation với allowDiskUse: true
        const batchResults = await mongod_log
          .aggregate(pipeline)
          .allowDiskUse(true)
          .exec();

        // Nếu không có kết quả trong batch, nghĩa là đã lấy hết dữ liệu
        if (batchResults.length === 0) break;

        // console.log(`🚀 ~ ok3. ${Date.now()}`);
        // Kết hợp batchResults vào nsCounts
        batchResults.forEach((batchItem) => {
          const existingItem = nsCounts.find(
            (item) => item.ns === batchItem.ns
          );
          if (existingItem) {
            // Cộng dồn các trường count và codes cho các kết quả trùng `ns`
            existingItem.count += batchItem.count;
            existingItem.codes.push(...batchItem.codes);
          } else {
            // Thêm bản ghi mới vào nsCounts nếu không có `ns` trùng
            nsCounts.push(batchItem);
          }
        });

        // Tăng skip để lấy batch tiếp theo
        skip += batchSize;
      }

      // Xử lý phần trăm `percentage` sau khi kết thúc vòng lặp
      nsCounts = nsCounts.map((item) => ({
        ...item,
        percentage: (item.count / totalRecords) * 100,
      }));

      return nsCounts;
    }

    const nsCounts = await getNsCountsInBatches(10000);

    // console.log("🚀 ~ xong");

    const nsPercentages = nsCounts.reduce((acc, item) => {
      const percentage = item.percentage.toFixed(2);
      let codeInfo = "";

      if (item.codes.length > 0) {
        codeInfo = `codes: ${item.codes.length}`;
      } else {
        codeInfo = "codes: 0";
      }
      acc[item.ns] = `${percentage}% , ${codeInfo}`;
      return acc;
    }, {});

    const msgPercentages = msgCounts.reduce((acc, item) => {
      acc[`${item.msg}`] = `${item.percentage.toFixed(2)}%`;
      return acc;
    }, {});

    return {
      msgPercentages,
      nsPercentages,
    };
  } catch (error) {
    console.error("Error in finData:", error);
    return { status: false, error: error.message };
  }
};
const statistics = async (req) => {
  try {
    // Lấy thông tin về các loại lệnh và collection duy nhất
    const uniqueInfo = await mongod_log
      .aggregate(createPipelineStatistics())
      .exec();

    // Đếm số lượng bản ghi cho commandTypes
    const commanTypes = await mongod_log.countDocuments({
      "attr.type": req.query.commandTypes || 0,
    });

    return {
      statistics: {
        ...uniqueInfo[0],
        commanTypes,
      },
    };
  } catch (error) {
    console.error("Error in finData:", error);
    return { status: false, error: error.message };
  }
};

// Hàm tạo mô tả mới từ thông tin bảng và trường tìm kiếm
const generateDescription = (table, field) => {
  return `tìm kiếm '${table}' theo '${field}'`;
};

const writeToExcel = async (resultsTotal) => {
  // Tạo một workbook mới
  const wb = XLSX.utils.book_new();

  // Tạo dữ liệu cho worksheet
  const wsData = [["Bảng", "Câu truy vấn", "Tỉ lệ %", "Mô tả"]];

  // Tạo một mảng tạm thời để lưu trữ dữ liệu cần sắp xếp
  const tempData = [];

  // Chuyển đổi dữ liệu từ resultsTotal vào định dạng mong muốn
  for (const [table, queries] of Object.entries(resultsTotal)) {
    for (const [queryType, attributes] of Object.entries(queries)) {
      attributes.forEach((attr) => {
        const attrParts = attr.attr.split(":");
        const field = attrParts[0].split(".").pop().trim(); // Lấy trường tìm kiếm, ví dụ 'customerCif'
        const percentage = parseFloat(attrParts[1].trim());
        const formattedPercentage = percentage; // Định dạng phần trăm
        // const formattedPercentage = formatPercentage(percentage); // Định dạng phần trăm

        // Thay thế mô tả bằng chuỗi mới
        const description = generateDescription(table, field);

        // Thêm dữ liệu vào mảng tạm
        tempData.push([
          table,
          queryType,
          percentage,
          formattedPercentage,
          description,
        ]);
      });
    }
  }

  // Sắp xếp theo phần trăm từ cao đến thấp
  tempData.sort((a, b) => b[2] - a[2]);

  // Đẩy dữ liệu đã sắp xếp vào wsData, bỏ cột percentage gốc (đã được định dạng)
  tempData.forEach((row) => {
    wsData.push([row[0], row[1], row[3], row[4]]);
  });

  // Tạo một worksheet từ dữ liệu
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Thiết lập độ rộng cột
  ws["!cols"] = [
    { wch: 20 }, // Bảng
    { wch: 15 }, // Câu truy vấn
    { wch: 10 }, // Tỉ lệ %
    { wch: 50 }, // Mô tả
  ];

  // Thêm worksheet vào workbook
  XLSX.utils.book_append_sheet(wb, ws, "Data");

  // Xác định đường dẫn để lưu file
  const fileName = `data_${Date.now()}.xlsx`;
  const filePath = path.join(__dirname, "exports", fileName);

  // Đảm bảo thư mục 'exports' tồn tại
  if (!fs.existsSync(path.join(__dirname, "exports"))) {
    fs.mkdirSync(path.join(__dirname, "exports"));
  }

  // Ghi workbook vào file
  XLSX.writeFile(wb, filePath);

  console.log(`đã ghi file excel phân tích thành công`);
  if (filePath) {
    return filePath;
  }
  return null;
};

const uploadFileExcell = async (filePathPromise) => {
  try {
    // Chờ để lấy đường dẫn file nếu filePath là một Promise
    const filePath = await filePathPromise;
    // console.log("🚀 ~ uploadFileExcell ~ filePath:", filePath);

    // 2. Upload file sau khi ghi
    const data = new FormData();
    data.append("file", fs.createReadStream(filePath));

    const config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "https://administrator.lifetek.vn:203/api/files/single",
      headers: {
        ...data.getHeaders(),
      },
      data: data,
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    };

    const response = await axios.request(config);
    if (response.status === 200) {
      return { success: true, url: response.data.url };
    }
    return { success: false, url: "lỗi upload" };
  } catch (error) {
    console.error("Lỗi:", error.message);
    return { success: false, url: "lỗi upload" };
  }
};

const deleteFileIfExists = async (filePath) => {
  try {
    // Kiểm tra nếu filePath là Promise
    if (filePath instanceof Promise) {
      filePath = await filePath; // Đợi cho Promise giải quyết và lấy giá trị thực tế
    }

    // Kiểm tra file tồn tại trước khi xóa
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      return true;
    } else {
      console.log(`File không tồn tại: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`Lỗi khi xóa file ${filePath}:`, error.message);
    return false;
  }
};

const importLogData = async (filePath) => {
  try {
    // Xóa tất cả dữ liệu trong bảng (collection)
    await mongod_log.deleteMany({});
    console.log("Đã xóa toàn bộ dữ liệu trong bảng.");

    const fileStream = fs.createReadStream(filePath);

    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let batchLogs = [];
    let batchSize = 10000; // Kích thước batch

    // Đọc từng dòng trong file và parse nó
    console.log("đang chuyển hóa dữ liệu json...");

    for await (const line of rl) {
      try {
        const log = JSON.parse(line);
        if (log.t && log.t.$date) {
          log.t = new Date(log.t.$date);
        }
        batchLogs.push(log);

        // Nếu số lượng bản ghi trong batch đạt ngưỡng, lưu vào DB
        if (batchLogs.length >= batchSize) {
          console.log(`đang insert ${batchLogs.length} bản ghi dữ liệu...`);
          await mongod_log.insertMany(batchLogs);
          console.log(`Đã lưu ${batchLogs.length} bản ghi vào cơ sở dữ liệu. 1`);
          batchLogs = []; // Xóa batchLogs sau khi lưu
        }
      } catch (error) {
        // Xử lý lỗi khi phân tích dòng JSON (nếu cần)
      }
    }

    // Lưu phần còn lại nếu có
    if (batchLogs.length > 0) {
      console.log(`đang insert ${batchLogs.length} bản ghi dữ liệu....`);
      await mongod_log.insertMany(batchLogs);
      console.log(`Đã lưu ${batchLogs.length} bản ghi vào cơ sở dữ liệu. 2`);
    }

    const count = await mongod_log.countDocuments();
    console.log(`Số bản ghi sau import: ${count}`);
    return true;
  } catch (error) {
    console.error("Lỗi khi nhập dữ liệu:", error.message);
    return false;
  }
};

module.exports = {
  finData,
  resultsTotal,
  resultsQuery,
  msgNsPercentages,
  statistics,
  writeToExcel,
  mongod_log,
  uploadFileExcell,
  deleteFileIfExists,
  importLogData,
};
