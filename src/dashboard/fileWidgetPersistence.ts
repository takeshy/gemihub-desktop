import { isBinaryDocumentFileName } from "./documentKind";

/**
 * File-widget state also contains preview data and view settings. Only a real
 * edit to a text document may be written through the text-file API.
 */
export function shouldPersistFileWidgetText(
  fileName: string,
  previousContent: string,
  requestedContent: unknown,
): requestedContent is string {
  return typeof requestedContent === "string" &&
    requestedContent !== previousContent &&
    !requestedContent.startsWith("data:") &&
    !isBinaryDocumentFileName(fileName);
}
