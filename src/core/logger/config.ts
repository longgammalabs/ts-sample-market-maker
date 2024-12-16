import { cleanEnv, str, bool } from "envalid";

function validateEnv() {
  return cleanEnv(process.env, {
    SERVICE_NAME: str({ default: "unknown service" }),
    SENTRY_DSN: str({ default: "" }),
    SENTRY_ENV: str({ choices: ["testnet", "mainnet"], default: "testnet" }),
    SEND_SENTRY_ERRORS: bool({ default: false }),
    LOG_LEVEL: str({ default: "debug" })
  });
}

const validatedEnv = validateEnv();

export const config = {
  SERVICE_NAME: validatedEnv.SERVICE_NAME,
  SENTRY_DSN: validatedEnv.SENTRY_DSN,
  SENTRY_ENV: validatedEnv.SENTRY_ENV,
  SEND_SENTRY_ERRORS: validatedEnv.SEND_SENTRY_ERRORS,
  LOG_LEVEL: validatedEnv.LOG_LEVEL
};
