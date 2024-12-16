import { expect, test, jest } from "@jest/globals";
const mockedConfig = { some: "json" };
jest.mock("./config.json", () => mockedConfig);
import config from "./config";

test("default test config", () => {
  expect(config).toEqual({
    ADDRESS: "test_address",
    MARKETS: "TOKX/TOKY|USD/TOK",
    PRIVATE_KEY: "abcdef",
    REST_API_URL: "test_api_url",
    RPC_URL: "test_rpc_url/test_rpc_key",
    WS_API_URL: "test_ws_url",
    some: "json"
  });
});
