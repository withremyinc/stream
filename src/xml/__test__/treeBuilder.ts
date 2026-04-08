import type { ParseErrorCode, XMLAttribute } from "../parser";
import type { XMLParserOutput } from "../xml";

export type XMLTestNode =
  | {
      type: "element";
      name: string;
      attributes: XMLAttribute[];
      children: XMLTestNode[];
    }
  | {
      type: "text";
      value: string;
    }
  | {
      type: "comment";
      value: string;
    }
  | {
      type: "cdata";
      value: string;
    }
  | {
      type: "processingInstruction";
      target: string;
      data: string;
    };

export type XMLTestDocument = {
  declaration: XMLAttribute[] | null;
  children: XMLTestNode[];
  errors: ParseErrorCode[];
};

type XMLElementNode = Extract<XMLTestNode, { type: "element" }>;

export function buildXMLTestTree(events: XMLParserOutput[]): XMLTestDocument {
  const document: XMLTestDocument = {
    declaration: null,
    children: [],
    errors: [],
  };

  const stack: XMLElementNode[] = [];

  function appendNode(node: XMLTestNode) {
    const parent = stack[stack.length - 1];
    if (parent) {
      parent.children.push(node);
    } else {
      document.children.push(node);
    }
  }

  for (const event of events) {
    switch (event.type) {
      case "onDocumentBegin":
      case "onDocumentEnd":
        break;
      case "onXmlDeclaration":
        document.declaration = event.attributes;
        break;
      case "onElementBegin": {
        const element: XMLElementNode = {
          type: "element",
          name: event.name,
          attributes: event.attributes,
          children: [],
        };
        appendNode(element);
        stack.push(element);
        break;
      }
      case "onElementEnd":
        stack.pop();
        break;
      case "onText":
        appendNode({ type: "text", value: event.value });
        break;
      case "onComment":
        appendNode({ type: "comment", value: event.value });
        break;
      case "onCData":
        appendNode({ type: "cdata", value: event.value });
        break;
      case "onProcessingInstruction":
        appendNode({
          type: "processingInstruction",
          target: event.target,
          data: event.data,
        });
        break;
      case "onError":
        document.errors.push(event.error);
        break;
    }
  }

  return document;
}
