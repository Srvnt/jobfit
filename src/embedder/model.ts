/** The embedding model, shared by the browser worker and the Node evaluation so both run the same thing. */
export const MODEL_ID = "Xenova/bge-small-en-v1.5";
export const MODEL_DTYPE = "q8";
export const POOLING = "cls";
/** bge models are trained to expect this instruction in front of search queries. */
export const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
