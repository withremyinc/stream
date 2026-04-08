import { extractXMLFromScanner, type XMLExtractOutput } from "./extract";
import { parseXMLFromScanner, type ParseOutput, type XMLAttribute } from "./parser";
import { scanXML, type ScanXMLOptions, type XMLTextMode } from "./scanner";

/**
 * Public event stream emitted by {@linkcode parseXML}.
 *
 * `parseXML()` is tolerant by default: it accepts XML documents and fragments,
 * emits `onError` for malformed structure, and continues when recovery is
 * straightforward.
 *
 * XML events intentionally do not include JSON-style path metadata.
 * Repeated sibling names and mixed content make a single canonical path
 * representation misleading, so consumers that need ancestry should keep their
 * own stack while reading events.
 */
export type XMLParserOutput = ParseOutput;
export type XMLParserOptions = ScanXMLOptions;

export type XMLExtractOptions = {
  allowTags: readonly string[];
  textMode?: XMLTextMode;
};

export type { XMLAttribute, XMLExtractOutput, XMLTextMode };

function composeTransforms<In, Mid, Out>(
  first: TransformStream<In, Mid>,
  second: TransformStream<Mid, Out>,
): TransformStream<In, Out> {
  void first.readable
    .pipeTo(second.writable, {
      preventCancel: true,
    })
    .catch(() => {});

  return {
    writable: first.writable,
    readable: second.readable,
  } as TransformStream<In, Out>;
}

export function parseXML(
  options: XMLParserOptions = {},
): TransformStream<string, XMLParserOutput> {
  return composeTransforms(scanXML(options), parseXMLFromScanner());
}

/**
 * Extracts a flat stream of allowlisted XML tags from otherwise mixed text.
 *
 * `extractXML()` emits only a subset of `parseXML()` events:
 * `onElementBegin`, `onText`, `onElementEnd`, and `onError`.
 *
 * Allowed tags are treated as opaque/foreign text islands so nested markup is
 * surfaced as a single `onText` payload. For nested XML structure, parse the
 * extracted payload separately with `parseXML()`.
 */
export function extractXML(
  options: XMLExtractOptions,
): TransformStream<string, XMLExtractOutput> {
  const allowTags = [...new Set(options.allowTags)];

  return composeTransforms(
    scanXML({ foreignTags: allowTags, textMode: options.textMode }),
    extractXMLFromScanner({ allowTags: new Set(allowTags) }),
  );
}
