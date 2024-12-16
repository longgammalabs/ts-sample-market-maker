import winston from "winston";
import { TransportStreamOptions } from "winston-transport";
import logger from "./logger";
import { SentryTransport, StackTransport } from "./loggerTransports";
import { safeJsonStringify } from "./sanitization";
import { config } from "./config";

/**
 * A Winston formatter to pretty-print logs in development
 */
const alignedWithColorsAndTime = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp(),
  winston.format.printf((info) => {
    const { level, ...args } = info;
    const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
    const argsString = safeJsonStringify(args, 2);
    return `${ts} [${level}]: ${argsString}`;
  })
);

export function addTransportsToLogger(): void {
  // Send errors to Sentry
  logger.add(
    new SentryTransport({
      level: "error"
    } as TransportStreamOptions)
  );

  // Send stack traces of any errors to the console.
  if (process.env.NODE_ENV === "development") {
    logger.add(
      new StackTransport({
        level: "error"
      } as TransportStreamOptions)
    );
  }

  // Send all logs to the console.
  logger.add(
    new winston.transports.Console({
      level: config.LOG_LEVEL,
      format: process.env.NODE_ENV === "development" ? alignedWithColorsAndTime : undefined
    } as TransportStreamOptions)
  );
}
