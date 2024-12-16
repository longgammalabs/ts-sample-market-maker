const mockedConfigJson = {
  maker: {
    symbols: {
      "TOKX/TOKY": {
        symbol: "TOKX/TOKY",
        sourceSymbol: "TOKXT/TOKYT",
        bids: {
          enabled: true,
          spreadInPercents: 0.1,
          limitCount: 3,
          limitDistanceInPercents: 0.2,
          qty: 200000
        },
        asks: {
          enabled: true,
          spreadInPercents: 0.1,
          limitCount: 3,
          limitDistanceInPercents: 0.2,
          qty: 200000
        },
        modifySpreadInPercents: 0.0,
        contractAddress: "0xA86F0AD9b353BF0De47DC6F367fdEc669D92F6fB",
        network: "Etherlink",
        pricePrecision: 4
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
import { expect, jest, test } from "@jest/globals";
import BigNumber from "bignumber.js";
import { EventEmitter } from "../core/eventEmitter";
import { Maker } from "./Maker";
import { MakerConfig } from "./configuration/MakerConfig";
import { IExecutor } from "../core/execution/abstract/IExecutor";
import { IOrderBookProvider } from "../core/marketData/abstract/IOrderBookProvider";
import { OrderBook } from "../core/marketData/OrderBook";
import { Order, OrderStatus, OrderType } from "../core/execution/Order";
import { PartialOrderBookUpdate } from "../core/marketData/binance/models/PartialOrderBookUpdate";

test("onTick call with no placed orders in lob", async () => {
  const makerConfig = new MakerConfig(mockedConfigJson.maker);
  const mockedExecutor: IExecutor = {
    getActiveOrders: jest.fn(() => []),
    getPendingOrders: jest.fn(() => []),
    ordersChanged: new EventEmitter<[data: Order[]]>(),
    availabilityChanged: new EventEmitter(),
    isOrderCanceled: () => false,
    orderSendAsync: jest.fn<IExecutor["orderSendAsync"]>(),
    orderCancelAsync: jest.fn<IExecutor["orderCancelAsync"]>()
  };
  const mockedSourceOrderBookProvider: IOrderBookProvider = {
    orderBookUpdated: new EventEmitter<[orderbook: OrderBook]>(),
    availabilityChanged: new EventEmitter(),
    isAvailable: true
  };
  const binanceOrderbook = new OrderBook("TOKXT/TOKYT");
  const binanceData = {
    lastUpdateId: 1,
    bids: [
      ["102903.99000000", "0.00014000"],
      ["102903.13000000", "0.00010000"]
    ] as [string, string][],
    asks: [
      ["102905.47000000", "7.35429000"],
      ["102906.05000000", "1.08382000"]
    ] as [string, string][]
  };
  const entries = PartialOrderBookUpdate.getEntries(binanceData);
  for (const entry of entries) {
    binanceOrderbook.applyEntry(entry);
  }
  const maker = new Maker({
    config: makerConfig.symbols["TOKX/TOKY"],
    executor: mockedExecutor,
    sourceOrderBookProvider: mockedSourceOrderBookProvider
  });
  maker.start();
  mockedExecutor.availabilityChanged.emit(true);
  mockedSourceOrderBookProvider.availabilityChanged?.emit(true);
  mockedSourceOrderBookProvider.orderBookUpdated?.emit(binanceOrderbook);
  // wait async calls from onTick
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(mockedExecutor.getActiveOrders).toBeCalledWith("TOKX/TOKY");
  expect(mockedExecutor.getPendingOrders).toBeCalledWith("TOKX/TOKY");
  expect(mockedExecutor.orderCancelAsync).not.toBeCalled();
  expect(mockedExecutor.orderSendAsync).toBeCalledTimes(6);
  expect(mockedExecutor.orderSendAsync).toHaveBeenNthCalledWith(
    1,
    "TOKX/TOKY",
    BigNumber("102801.6854"),
    200000n,
    "bid"
  );
  expect(mockedExecutor.orderSendAsync).toHaveBeenNthCalledWith(
    2,
    "TOKX/TOKY",
    BigNumber("102595.8762"),
    200000n,
    "bid"
  );
  expect(mockedExecutor.orderSendAsync).toHaveBeenNthCalledWith(
    3,
    "TOKX/TOKY",
    BigNumber("102390.067"),
    200000n,
    "bid"
  );
  expect(mockedExecutor.orderSendAsync).toHaveBeenNthCalledWith(
    4,
    "TOKX/TOKY",
    BigNumber("103007.4946"),
    200000n,
    "ask"
  );
  expect(mockedExecutor.orderSendAsync).toHaveBeenNthCalledWith(
    5,
    "TOKX/TOKY",
    BigNumber("103213.3038"),
    200000n,
    "ask"
  );
  expect(mockedExecutor.orderSendAsync).toHaveBeenNthCalledWith(
    6,
    "TOKX/TOKY",
    BigNumber("103419.113"),
    200000n,
    "ask"
  );
});

test("onTick calls with active orders in executor", async () => {
  const makerConfig = new MakerConfig(mockedConfigJson.maker);
  const activeOrders = [
    new Order({
      orderId: "testOrderId1",
      price: BigNumber("102801.6854"),
      qty: 200000n,
      leaveQty: 200000n,
      claimedQty: 0n,
      side: "bid",
      symbol: "TOKX/TOKY",
      status: OrderStatus.Placed,
      type: OrderType.Return,
      created: new Date(),
      lastChanged: new Date(),
      txnHash: "testTxnHash1"
    }),
    new Order({
      orderId: "testOrderId2",
      price: BigNumber("102595.8762"),
      qty: 200000n,
      leaveQty: 200000n,
      claimedQty: 0n,
      side: "bid",
      symbol: "TOKX/TOKY",
      status: OrderStatus.Placed,
      type: OrderType.Return,
      created: new Date(),
      lastChanged: new Date(),
      txnHash: "testTxnHash2"
    }),
    new Order({
      orderId: "testOrderId3",
      price: BigNumber("102390.067"),
      qty: 200000n,
      leaveQty: 200000n,
      claimedQty: 0n,
      side: "bid",
      symbol: "TOKX/TOKY",
      status: OrderStatus.Placed,
      type: OrderType.Return,
      created: new Date(),
      lastChanged: new Date(),
      txnHash: "testTxnHash3"
    })
  ];
  const mockedExecutor: IExecutor = {
    getActiveOrders: () => activeOrders,
    getPendingOrders: () => [],
    ordersChanged: new EventEmitter<[data: Order[]]>(),
    availabilityChanged: new EventEmitter(),
    isOrderCanceled: () => false,
    orderSendAsync: jest.fn<IExecutor["orderSendAsync"]>(),
    orderCancelAsync: jest.fn<IExecutor["orderCancelAsync"]>()
  };
  const mockedSourceOrderBookProvider: IOrderBookProvider = {
    orderBookUpdated: new EventEmitter<[orderbook: OrderBook]>(),
    availabilityChanged: new EventEmitter(),
    isAvailable: true
  };
  const binanceOrderbook = new OrderBook("TOKXT/TOKYT");
  const binanceData = {
    lastUpdateId: 1,
    bids: [
      ["102903.99000000", "0.00014000"],
      ["102903.13000000", "0.00010000"]
    ] as [string, string][],
    asks: [
      ["102905.47000000", "7.35429000"],
      ["102906.05000000", "1.08382000"]
    ] as [string, string][]
  };
  const entries = PartialOrderBookUpdate.getEntries(binanceData);
  for (const entry of entries) {
    binanceOrderbook.applyEntry(entry);
  }
  const maker = new Maker({
    config: makerConfig.symbols["TOKX/TOKY"],
    executor: mockedExecutor,
    sourceOrderBookProvider: mockedSourceOrderBookProvider
  });
  maker.start();
  mockedExecutor.availabilityChanged.emit(true);
  mockedSourceOrderBookProvider.availabilityChanged?.emit(true);
  mockedSourceOrderBookProvider.orderBookUpdated?.emit(binanceOrderbook);
  // wait async calls from onTick
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(mockedExecutor.orderCancelAsync).not.toBeCalled();
  expect(mockedExecutor.orderSendAsync).toBeCalledTimes(3);
});

test("onTick calls with pending orders in executor", async () => {
  const makerConfig = new MakerConfig(mockedConfigJson.maker);
  const pendingOrders = [
    new Order({
      orderId: "testOrderId1",
      price: BigNumber("102801.6854"),
      qty: 200000n,
      leaveQty: 200000n,
      claimedQty: 0n,
      side: "bid",
      symbol: "TOKX/TOKY",
      status: OrderStatus.Placed,
      type: OrderType.Return,
      created: new Date(),
      lastChanged: new Date(),
      txnHash: "testTxnHash1"
    }),
    new Order({
      orderId: "testOrderId2",
      price: BigNumber("102595.8762"),
      qty: 200000n,
      leaveQty: 200000n,
      claimedQty: 0n,
      side: "bid",
      symbol: "TOKX/TOKY",
      status: OrderStatus.Placed,
      type: OrderType.Return,
      created: new Date(),
      lastChanged: new Date(),
      txnHash: "testTxnHash2"
    }),
    new Order({
      orderId: "testOrderId3",
      price: BigNumber("102390.067"),
      qty: 200000n,
      leaveQty: 200000n,
      claimedQty: 0n,
      side: "bid",
      symbol: "TOKX/TOKY",
      status: OrderStatus.Placed,
      type: OrderType.Return,
      created: new Date(),
      lastChanged: new Date(),
      txnHash: "testTxnHash3"
    })
  ];
  const mockedExecutor: IExecutor = {
    getActiveOrders: () => [],
    getPendingOrders: () => pendingOrders,
    ordersChanged: new EventEmitter<[data: Order[]]>(),
    availabilityChanged: new EventEmitter(),
    isOrderCanceled: () => false,
    orderSendAsync: jest.fn<IExecutor["orderSendAsync"]>(),
    orderCancelAsync: jest.fn<IExecutor["orderCancelAsync"]>()
  };
  const mockedSourceOrderBookProvider: IOrderBookProvider = {
    orderBookUpdated: new EventEmitter<[orderbook: OrderBook]>(),
    availabilityChanged: new EventEmitter(),
    isAvailable: true
  };
  const binanceOrderbook = new OrderBook("TOKXT/TOKYT");
  const binanceData = {
    lastUpdateId: 1,
    bids: [
      ["102903.99000000", "0.00014000"],
      ["102903.13000000", "0.00010000"]
    ] as [string, string][],
    asks: [
      ["102905.47000000", "7.35429000"],
      ["102906.05000000", "1.08382000"]
    ] as [string, string][]
  };
  const entries = PartialOrderBookUpdate.getEntries(binanceData);
  for (const entry of entries) {
    binanceOrderbook.applyEntry(entry);
  }
  const maker = new Maker({
    config: makerConfig.symbols["TOKX/TOKY"],
    executor: mockedExecutor,
    sourceOrderBookProvider: mockedSourceOrderBookProvider
  });
  maker.start();
  mockedExecutor.availabilityChanged.emit(true);
  mockedSourceOrderBookProvider.availabilityChanged?.emit(true);
  mockedSourceOrderBookProvider.orderBookUpdated?.emit(binanceOrderbook);
  // wait async calls from onTick
  await new Promise((resolve) => setTimeout(resolve, 10));

  expect(mockedExecutor.orderCancelAsync).not.toBeCalled();
  expect(mockedExecutor.orderSendAsync).toBeCalledTimes(3);
});
