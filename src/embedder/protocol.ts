import type { EmbedKind } from "../core/types";

export interface WorkerRequest {
  id: number;
  texts: string[];
  kind: EmbedKind;
}

export type WorkerResponse =
  | { type: "progress"; file: string; progress: number }
  | { type: "result"; id: number; vectors: number[][] }
  | { type: "error"; id: number; message: string };
