/**
 * Embedding models, shared by the browser worker and the Node evaluation so both run the same thing.
 * Retrieval models are trained with fixed prefixes on the searched-for and searched-in texts.
 */
export interface ModelConfig {
  id: string;
  dtype: "q8";
  pooling: "cls" | "mean";
  queryPrefix: string;
  passagePrefix: string;
  /** Rough download size, shown to the user before the first analysis. */
  sizeMB: number;
}

export const MODELS = {
  "bge-small-en": {
    id: "Xenova/bge-small-en-v1.5",
    dtype: "q8",
    pooling: "cls",
    queryPrefix: "Represent this sentence for searching relevant passages: ",
    passagePrefix: "",
    sizeMB: 34,
  },
  "multilingual-e5-small": {
    id: "Xenova/multilingual-e5-small",
    dtype: "q8",
    pooling: "mean",
    queryPrefix: "query: ",
    passagePrefix: "passage: ",
    sizeMB: 118,
  },
  "paraphrase-multilingual-minilm": {
    id: "Xenova/paraphrase-multilingual-MiniLM-L12-v2",
    dtype: "q8",
    pooling: "mean",
    queryPrefix: "",
    passagePrefix: "",
    sizeMB: 118,
  },
} satisfies Record<string, ModelConfig>;

export type ModelName = keyof typeof MODELS;

/**
 * The model the app uses. paraphrase-multilingual-MiniLM won `npm run eval`: 83% vs 77% for
 * bge-small-en overall, and 81% vs 57% on Finnish requirements, for a larger one-time download.
 */
export const ACTIVE_MODEL: ModelConfig = MODELS["paraphrase-multilingual-minilm"];

export const withPrefix = (model: ModelConfig, texts: string[], kind: "query" | "passage") => {
  const prefix = kind === "query" ? model.queryPrefix : model.passagePrefix;
  return prefix ? texts.map((t) => prefix + t) : texts;
};
