import { cleanEnv, str } from "envalid";
import makerConfig from "./config.json";
import { NetworkConfig } from "./configuration/NetworkConfig";

function validateEnv() {
  return cleanEnv(process.env, {
    ADDRESS: str({ default: "" }),
    PRIVATE_KEY: str({ default: "" }),
    MARKETS: str({ default: "*" }),
    REST_API_URL: str(),
    WS_API_URL: str(),
    RPC_URL: str(),
    RPC_KEY: str({ default: "" })
  });
}

const validatedEnv = validateEnv();

export const config = {
  ADDRESS: validatedEnv.ADDRESS,
  PRIVATE_KEY: validatedEnv.PRIVATE_KEY,
  MARKETS: validatedEnv.MARKETS,
  REST_API_URL: validatedEnv.REST_API_URL,
  WS_API_URL: validatedEnv.WS_API_URL,
  RPC_URL: `${validatedEnv.RPC_URL}/${validatedEnv.RPC_KEY}`,
  ...makerConfig
};

type ValueOf<T> = T[keyof T];
export type SymbolJsonConfig = ValueOf<typeof config.maker.symbols>;
export type ConfigMakerType = {
  symbols: Record<string, SymbolJsonConfig>;
  networks: Record<string, NetworkConfig>;
  tokens: Record<string, string>;
};

export default config;
