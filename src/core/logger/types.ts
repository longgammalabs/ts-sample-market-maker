import winston from "winston";

// LOGGER TYPING

export interface PagerDutyInfo {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  message: {};
  id?: string;
}

// Enforce type constraints on the objects passed into Winston logging functions.
export interface InfoObject extends PagerDutyInfo {
  [key: string]: unknown;
  // Note: If message were missing, the info object would get wrapped as { message: infoObject },
  // which is not what we want since it can prevent errors from being reported as expected.
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  message: {};
  at: string;
  // Require `error` to be the right type.
  error?: Error;
}

// Fix types. The methods available depend on the levels used. We're using syslog levels, so these
// methods don't actually exist on our logger object.
type UnusedLevels = "warn" | "help" | "data" | "prompt" | "http" | "verbose" | "input" | "silly";

// Enforce type constraints on the objects passed into Winston logging functions.
interface LeveledLogMethod {
  (infoObject: InfoObject): winston.Logger;
}
// Exclude the functions whose type we want to change from the base definition. This seems to be
// enough (and the only way I've found) to trick TypeScript into accepting the modified LoggerExport
// as a valid extension of the base winston.Logger type.
type SyslogLevels = "emerg" | "alert" | "crit" | "error" | "warning" | "notice" | "info" | "debug";
export interface LoggerExport extends Omit<winston.Logger, UnusedLevels | SyslogLevels> {
  emerg: LeveledLogMethod;
  alert: LeveledLogMethod;
  crit: LeveledLogMethod;
  error: LeveledLogMethod;
  warning: LeveledLogMethod;
  notice: LeveledLogMethod;
  info: LeveledLogMethod;
  debug: LeveledLogMethod;
}
