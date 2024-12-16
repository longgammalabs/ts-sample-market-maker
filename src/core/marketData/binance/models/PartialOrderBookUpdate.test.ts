import { expect, test } from "@jest/globals";
import { PartialOrderBookUpdate } from "./PartialOrderBookUpdate";
import { Entry } from "../../models/Entry";

type BinancePartialOrderbookStreamData = Parameters<typeof PartialOrderBookUpdate.getEntries>[0];

test.each([
  [
    {
      lastUpdateId: 1,
      bids: [] as [string, string][],
      asks: [] as [string, string][]
    },
    []
  ],
  [
    {
      lastUpdateId: 56520668409,
      bids: [
        ["102905.46000000", "0.30391000"],
        ["102904.01000000", "0.00019000"],
        ["102904.00000000", "0.02840000"],
        ["102903.99000000", "0.00014000"],
        ["102903.13000000", "0.00010000"]
      ] as [string, string][],
      asks: [
        ["102905.47000000", "7.35429000"],
        ["102906.05000000", "1.08382000"],
        ["102906.06000000", "0.10554000"],
        ["102906.69000000", "0.38062000"],
        ["102907.60000000", "0.00011000"]
      ] as [string, string][]
    },
    [
      new Entry({
        price: 102905.46,
        qtyProfile: [0.30391],
        side: "bid",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102904.01,
        qtyProfile: [0.00019],
        side: "bid",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102904,
        qtyProfile: [0.0284],
        side: "bid",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102903.99,
        qtyProfile: [0.00014],
        side: "bid",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102903.13,
        qtyProfile: [0.0001],
        side: "bid",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102905.47,
        qtyProfile: [7.35429],
        side: "ask",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102906.05,
        qtyProfile: [1.08382],
        side: "ask",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102906.06,
        qtyProfile: [0.10554],
        side: "ask",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102906.69,
        qtyProfile: [0.38062],
        side: "ask",
        transactionId: 56520668409
      }),
      new Entry({
        price: 102907.6,
        qtyProfile: [0.00011],
        side: "ask",
        transactionId: 56520668409
      })
    ]
  ]
])("get entries from binance data", (binanceData: BinancePartialOrderbookStreamData, expectedEntries: Entry[]) => {
  const entries = PartialOrderBookUpdate.getEntries(binanceData);
  expect(entries).toEqual(expectedEntries);
});
