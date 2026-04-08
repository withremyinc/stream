# Deferred XML parsing ideas

- Fuse `scanXML()` and `parseXMLFromScanner()` into a direct string→event transform to remove the internal token-stream `TransformStream` layer, not just the public wrapper.
- Add a fast-path in `scanEntityReference()` / attribute scanning for the common case of plain ASCII content with no entities, reducing per-character branching in heavily attributed XML datasets.
