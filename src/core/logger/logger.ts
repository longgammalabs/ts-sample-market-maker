import winston from "winston";

import { LoggerExport } from "./types";
import { config } from "./config";

const logger: LoggerExport = winston.createLogger({
  levels: winston.config.syslog.levels,
  level: config.LOG_LEVEL,
  format: winston.format.combine(
    winston.format((info) => {
      return {
        ...info,
        error: info.error
      };
    })(),
    winston.format.json()
  )
});

export default logger;
