import * as Sentry from "@sentry/node";
import util from "util";
import Transport from "winston-transport";
import { InfoObject } from "./types";
import { safeJsonStringify } from "./sanitization";
import { config } from "./config";

/**
 * A Winston transport to log the stack traces of errors during development.
 */
export class StackTransport extends Transport {
  log(info: InfoObject, callback: () => void) {
    setImmediate(() => {
      if (info.error) {
        const { error } = info;
        // Note that util.inspect() is able to handle circular objects.
        const errorString = error && (error.stack || util.inspect(error));
        console.error(errorString);
      }
    });
    if (callback) {
      callback();
    }
  }
}

/**
 * A Winston transport which reports an error to Sentry.
 */
export class SentryTransport extends Transport {
  log(info: InfoObject, callback: () => void) {
    setImmediate(() => {
      if (Sentry.isInitialized() && config.SEND_SENTRY_ERRORS) {
        const sentryInfo: InfoObject = {
          ...info,
          serviceName: config.SERVICE_NAME
        };
        Sentry.captureException(sentryInfo.error ?? new Error(safeJsonStringify(sentryInfo.message)), (event) => {
          event.setLevel("error");
          event.setExtras(sentryInfo);
          event.setFingerprint([safeJsonStringify(sentryInfo.message), sentryInfo.at, config.SERVICE_NAME]);
          return event;
        });
      }
    });
    if (callback) {
      callback();
    }
  }
}
