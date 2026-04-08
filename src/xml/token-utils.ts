import { type ScanOutput, type ScanError, SyntaxKind } from "./scanner";

import { GENERATOR_END } from "../util/generators";

export type ScanTokenOf<K extends SyntaxKind> = Extract<ScanOutput, { token: K }>;

export function matchesToken<K extends SyntaxKind>(
  scanOutput: ScanOutput | typeof GENERATOR_END,
  token: K,
): scanOutput is ScanTokenOf<K> {
  if (scanOutput === GENERATOR_END) {
    return false;
  }
  if (!("token" in scanOutput)) {
    return false;
  }
  return scanOutput.token === token;
}

export function isErrorToken(
  scanOutput: ScanOutput | typeof GENERATOR_END,
): scanOutput is Extract<ScanOutput, { error: ScanError }> {
  return scanOutput !== GENERATOR_END && "error" in scanOutput;
}
