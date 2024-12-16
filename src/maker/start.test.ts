const mockedConfigJson = {
  maker: {
    symbols: {
      "TOKX/TOKY": {
        symbol: "TOKX/TOKY",
        sourceSymbol: "TOKXT/TOKYT",
        bids: {
          enabled: true,
          spreadInPercents: 0.1,
          limitCount: 10,
          limitDistanceInPercents: 0.2,
          qty: 200000
        },
        asks: {
          enabled: true,
          spreadInPercents: 0.1,
          limitCount: 10,
          limitDistanceInPercents: 0.2,
          qty: 200000
        },
        modifySpreadInPercents: 0.0,
        contractAddress: "0xA86F0AD9b353BF0De47DC6F367fdEc669D92F6fB",
        network: "Etherlink",
        pricePrecision: 4
      },
      "USD/TOK": {
        symbol: "USD/TOK",
        sourceSymbol: "USDT/TOK",
        bids: {
          enabled: true,
          spreadInPercents: 0.05,
          limitCount: 10,
          limitDistanceInPercents: 0.2,
          qty: 15000
        },
        asks: {
          enabled: true,
          spreadInPercents: 0.05,
          limitCount: 2,
          limitDistanceInPercents: 0.2,
          qty: 15000
        },
        modifySpreadInPercents: 0.0,
        contractAddress: "0x46FbD14B11891100f25A7b543bDFe68fF95A277f",
        network: "Etherlink",
        pricePrecision: 0
      }
    },
    networks: {
      Etherlink: {
        rpcNode: "https://node.ghostnet.etherlink.com",
        chainId: 128123
      }
    },
    tokens: {
      TOKX: "0xB1Ea698633d57705e93b0E40c1077d46CD6A51d8",
      TOXY: "0x9626cC8790c547779551B5948029a4f646853F91",
      USD: "0x92d81a25F6f46CD52B8230ef6ceA5747Bc3826Db",
      TOK: "0x8DEF68408Bc96553003094180E5C90d9fe5b88C1"
    }
  }
};
jest.mock("./config.json", () => mockedConfigJson);
jest.mock("ethers");
jest.mock("onchain-lob-sdk");
jest.mock("../core/wallet/evm/RpcTransactionTracker");
jest.mock("../core/execution/onchainLob/Executor", () => {
  return {
    Executor: jest.fn().mockImplementation(() => {
      return {
        allowanceAsync: async () => Promise.resolve(100n),
        ordersChanged: { addListener: jest.fn() },
        availabilityChanged: { addListener: jest.fn() }
      };
    })
  };
});
const mockedProviderStart = jest.fn();
jest.mock("../core/marketData/binance/BinanceWsPartialOrderBookProvider", () => {
  return {
    BinanceWsPartialOrderBookProvider: jest.fn().mockImplementation(() => {
      return {
        start: mockedProviderStart,
        availabilityChanged: { addListener: jest.fn() },
        orderBookUpdated: { addListener: jest.fn() }
      };
    })
  };
});
const mockedMakerStart = jest.fn();
jest.mock("./Maker", () => {
  return {
    Maker: jest.fn().mockImplementation(() => {
      return {
        start: mockedMakerStart
      };
    })
  };
});

import { expect, test, jest, afterAll, afterEach, beforeEach } from "@jest/globals";
import { OnchainLobClient } from "onchain-lob-sdk";
import { RpcTransactionTracker } from "../core/wallet/evm/RpcTransactionTracker";
import { Executor } from "../core/execution/onchainLob/Executor";
import { JsonRpcProvider, Wallet, Network } from "ethers";
import { MakerConfig } from "./configuration/MakerConfig";
import { BinanceWsPartialOrderBookProvider } from "../core/marketData/binance/BinanceWsPartialOrderBookProvider";
import { Maker } from "./Maker";
import { start } from "./start";

const mockedRpcTransactionTracker = jest.mocked(RpcTransactionTracker);
const mockedExecutor = jest.mocked(Executor);
const mockedBinanceWsPartialOrderBookProvider = jest.mocked(BinanceWsPartialOrderBookProvider);
const mockedWallet = jest.mocked(Wallet);
const mockedJsonRpcProvider = jest.mocked(JsonRpcProvider);
const mockedNetwork = jest.mocked(Network);
const mockedOnchainLobClient = jest.mocked(OnchainLobClient);
const mockedMaker = jest.mocked(Maker);

const mockedExit = jest.spyOn(process, "exit").mockImplementation((code: string | number | null | undefined) => {
  throw new Error(`process.exit called with code ${code}`);
});
const mockedOn = jest
  .spyOn(process, "on")
  .mockImplementation((_event: string | symbol, _listener: (...args: unknown[]) => void) => {
    return process;
  });

afterEach(() => {
  jest.clearAllMocks();
});

afterAll(() => {
  mockedExit.mockRestore();
  mockedOn.mockRestore();
});

test("successful start running", async () => {
  await start();
  expect(mockedNetwork).toBeCalledTimes(1);
  expect(mockedNetwork).toBeCalledWith("testnet", 128123);
  expect(mockedJsonRpcProvider).toBeCalledTimes(1);
  expect(mockedJsonRpcProvider).toBeCalledWith("test_rpc_url/test_rpc_key", expect.any(Network), {
    polling: true,
    pollingInterval: 100,
    staticNetwork: expect.any(Network)
  });
  expect(mockedWallet).toBeCalledTimes(1);
  expect(mockedWallet).toBeCalledWith("abcdef", expect.any(JsonRpcProvider));
  expect(mockedOnchainLobClient).toBeCalledTimes(1);
  expect(mockedOnchainLobClient).toBeCalledWith({
    apiBaseUrl: "test_api_url",
    autoWaitTransaction: false,
    signer: expect.any(Wallet),
    webSocketApiBaseUrl: "test_ws_url",
    webSocketConnectImmediately: true
  });
  expect(mockedRpcTransactionTracker).toBeCalledTimes(1);
  expect(mockedRpcTransactionTracker).toHaveBeenCalledWith();
  expect(mockedExecutor).toBeCalledTimes(1);
  expect(mockedExecutor).toHaveBeenCalledWith({
    config: expect.any(MakerConfig),
    client: expect.any(OnchainLobClient),
    tracker: expect.any(RpcTransactionTracker),
    signer: expect.any(Wallet),
    symbols: ["TOKX/TOKY", "USD/TOK"],
    makerAddress: "test_address"
  });
  expect(mockedBinanceWsPartialOrderBookProvider).toBeCalledTimes(1);
  expect(mockedBinanceWsPartialOrderBookProvider).toHaveBeenCalledWith({
    depth: 5,
    symbols: ["TOKXT/TOKYT", "USDT/TOK"],
    updateSpeed: 1000
  });
  expect(mockedProviderStart).toBeCalled();
  expect(mockedMaker).toBeCalledTimes(2);
  expect(mockedMaker).toHaveBeenNthCalledWith(1, {
    config: mockedConfigJson.maker.symbols["TOKX/TOKY"],
    executor: expect.any(Object),
    sourceOrderBookProvider: expect.any(Object)
  });
  expect(mockedMaker).toHaveBeenNthCalledWith(2, {
    config: mockedConfigJson.maker.symbols["USD/TOK"],
    executor: expect.any(Object),
    sourceOrderBookProvider: expect.any(Object)
  });
  expect(mockedMakerStart).toBeCalledTimes(2);
  expect(mockedExit).toBeCalledTimes(0);
  expect(mockedOn).toBeCalledTimes(2);
  expect(mockedOn).toHaveBeenNthCalledWith(1, "SIGINT", expect.any(Function));
  expect(mockedOn).toHaveBeenNthCalledWith(2, "SIGTERM", expect.any(Function));
});
