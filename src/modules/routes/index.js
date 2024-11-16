const apiLogsRoute = require('../apiLogs/apiLogs.route');
const dbLogsRoute = require('../mongodLog/mongodLog.route');

const routes = (app) => {
  app.use('/api/api-logs/', apiLogsRoute);
  app.use('/api/db-logs/', dbLogsRoute);
};
module.exports = routes;
