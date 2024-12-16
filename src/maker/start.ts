import { OnchainLobClient, OnchainLobClientOptions } from "onchain-lob-sdk";
import config, { SymbolJsonConfig } from "./config";
import logger from "../core/logger";
import { JsonRpcProvider, Wallet, Network } from "ethers";
import { RpcTransactionTracker } from "../core/wallet/evm/RpcTransactionTracker";
import { Executor } from "../core/execution/onchainLob/Executor";
import { MakerConfig } from "./configuration/MakerConfig";
import { BinanceWsPartialOrderBookProvider } from "../core/marketData/binance/BinanceWsPartialOrderBookProvider";
import { BinancePartialOrderBookDepth } from "../core/marketData/binance/BinancePartialOrderBookDepth";
import { UpdateSpeed } from "../core/marketData/binance/UpdateSpeed";
import { Maker } from "./Maker";

// remove export
export async function start() {
  printWelcome();

  const address = config.ADDRESS;
  const privateKey = config.PRIVATE_KEY;
  if (!address || !privateKey) {
    logger.crit({ at: "maker#start", message: "Set maker key and address!" });
    process.exit(1);
  }
  printAccountInfo(address);

  const network = new Network("testnet", config.maker.networks.Etherlink.chainId);
  const provider = new JsonRpcProvider(config.RPC_URL, network, {
    pollingInterval: 100,
    polling: true,
    staticNetwork: network
  });
  const signer = new Wallet(privateKey, provider);
  const options: OnchainLobClientOptions = {
    apiBaseUrl: config.REST_API_URL,
    webSocketApiBaseUrl: config.WS_API_URL,
    signer: signer,
    webSocketConnectImmediately: true,
    autoWaitTransaction: false
  };
  const olClient = new OnchainLobClient(options);
  const makerConfig = new MakerConfig(config.maker);
  const transactionTracker = new RpcTransactionTracker();
  let symbols: string[], sourceSymbols: string[];
  if (config.MARKETS === "*") {
    symbols = Object.keys(config.maker.symbols as Record<string, SymbolJsonConfig>);
    sourceSymbols = symbols.map((s) => (config.maker.symbols as Record<string, SymbolJsonConfig>)[s]!.sourceSymbol);
  } else {
    symbols = config.MARKETS.split("|");
    for (const symbol of symbols) {
      if ((config.maker.symbols as Record<string, SymbolJsonConfig>)[symbol] === undefined) {
        logger.crit({
          at: "maker#start",
          message: `Set config for symbol ${symbol} in config.json`
        });
        process.exit(1);
      }
    }
    sourceSymbols = symbols.map((s) => (config.maker.symbols as Record<string, SymbolJsonConfig>)[s]!.sourceSymbol);
  }

  logger.info({
    at: "index#start",
    message: `Starting with symbols ${symbols} and sources ${sourceSymbols}`
  });

  const executor = new Executor({
    config: makerConfig,
    client: olClient,
    tracker: transactionTracker,
    signer: signer,
    symbols: symbols,
    makerAddress: address
  });
  const binanceOrderBookProvider = new BinanceWsPartialOrderBookProvider({
    depth: BinancePartialOrderBookDepth.Five,
    updateSpeed: UpdateSpeed.Ms1000, // UpdateSpeed.Ms100
    symbols: sourceSymbols
  });

  const makers = symbols.map(
    (symbol) =>
      new Maker({
        config: makerConfig.symbols[symbol],
        executor: executor,
        sourceOrderBookProvider: binanceOrderBookProvider
      })
  );

  for (const symbol of symbols) {
    const tokens = symbol.split("/");

    for (const token of tokens) {
      logger.info({
        at: "index#start",
        message: `Check allowance for token ${token} and symbol ${symbol}`
      });

      try {
        const allowance = await executor.allowanceAsync(symbol, makerConfig.tokens[token]);

        logger.info({ at: "index#start", message: `Allowance: ${allowance}` });

        if (allowance !== 0n) {
          continue;
        }

        logger.info({
          at: "index#start",
          message: `Try approve for token ${token} and symbol ${symbol}`
        });

        await executor.approveAsync(symbol, makerConfig.tokens[token], 1000000000000000000000000000n);
      } catch (error) {
        logger.error({
          at: "index#start",
          message: `Can't get allowance for token ${token} and symbol ${symbol}`,
          error
        });
        throw error;
      }
    }
  }

  for (const maker of makers) {
    maker.start();
  }
  binanceOrderBookProvider.start();

  async function gracefulShutdown(eventName: string) {
    logger.info({
      at: "worker",
      message: `Received ${eventName}. Gracefully shutting down...`
    });
    try {
      for (const maker of makers) {
        maker.stop();
      }
      binanceOrderBookProvider.stop();
      process.exit(0);
    } catch (error) {
      logger.error({
        at: "worker",
        message: "Error during stopping services:",
        error
      });
      process.exit(1);
    }
  }

  process.on("SIGINT", gracefulShutdown);
  process.on("SIGTERM", gracefulShutdown);
}

function printAccountInfo(address: string) {
  console.log("┌─────────────────────────────────────────────────────┐");
  console.log(`│ Address: ${address} │`);
  console.log("└─────────────────────────────────────────────────────┘");
}

function printWelcome() {
  const appVersion = "1.0.0"; // Placeholder for version, replace with actual logic if needed
  const appName = `v${appVersion}`;

  console.log(`  _    _             _ _   __  __       _`);
  console.log(` | |  | |           (_|_) |  \\/  |     | |`);
  console.log(` | |__| | __ _ _ __  _ _  | \\  / | __ _| | _____ _ __`);
  console.log(` |  __  |/ _\` | '_ \\| | | | |\\/| |/ _\` | |/ / _ \\ '__|`);
  console.log(` | |  | | (_| | | | | | |_| |  | | (_| |   <  __/ |`);
  console.log(` |_|  |_|\\__,_|_| |_| |_(_)_|  |_|\\__,_|_|\\_\\___|_|`);
  console.log(`                   _/ |`);
  console.log(`                  |__/`);
  console.log();
  console.log(appName.padStart(26 + appName.length / 2));
  console.log();
}
