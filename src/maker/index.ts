import logger from "../core/logger";
import { start } from "./start";

start().catch((error) => {
  logger.error({
    at: "index#start",
    message: "Error starting service",
    error
  });
  process.exit(1);
});
