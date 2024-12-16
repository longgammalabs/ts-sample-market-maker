import { test, jest, expect, beforeEach } from "@jest/globals";
import { Provider } from "ethers";
import { NonceManager } from "./NonceManager";

beforeEach(() => {
  // manually clean nonces in manager
  const manager = NonceManager.getInstance();
  manager["offlineNonces"] = new Map();
  manager["networkNonces"] = new Map();
});

test("nonce request in parallel for one address", async () => {
  const manager = NonceManager.getInstance();
  const mockedRpc = {
    getTransactionCount: jest.fn(
      () =>
        new Promise((resolve) => {
          const delay = Math.floor(Math.random() * 21) + 10;
          setTimeout(() => resolve(4391), delay);
        })
    )
  } as unknown as Provider;
  const nonces = await Promise.all([
    manager.getNonceAsync(mockedRpc, "address1"),
    manager.getNonceAsync(mockedRpc, "address1"),
    manager.getNonceAsync(mockedRpc, "address1")
  ]);
  nonces.sort();
  expect(nonces).toEqual([4391n, 4392n, 4393n]);
});

test("nonce request in parallel for different addresses", async () => {
  const manager = NonceManager.getInstance();
  const mockedRpc = {
    getTransactionCount: jest.fn(
      () =>
        new Promise((resolve) => {
          const delay = Math.floor(Math.random() * 21) + 10;
          setTimeout(() => resolve(4391), delay);
        })
    )
  } as unknown as Provider;
  const nonces = await Promise.all([
    manager.getNonceAsync(mockedRpc, "address1"),
    manager.getNonceAsync(mockedRpc, "address2"),
    manager.getNonceAsync(mockedRpc, "address1"),
    manager.getNonceAsync(mockedRpc, "address1"),
    manager.getNonceAsync(mockedRpc, "address2")
  ]);
  nonces.sort();
  expect(nonces).toEqual([4391n, 4391n, 4392n, 4392n, 4393n]);
});
