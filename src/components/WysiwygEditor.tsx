import { useRef } from "react";
// wysimark-lite is derived from portive/wysimark under the MIT License.
// See THIRD_PARTY_NOTICES.md for attribution and the full license text.
import { Editable, useEditor } from "wysimark-lite";

type SlateEntry = [unknown, number[]];
type SlateEditor = ReturnType<typeof useEditor> & {
  children: unknown[];
  normalizeNode: (entry: SlateEntry) => void;
};

export function WysiwygEditor({
  value,
  onChange,
  onImageChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onImageChange?: (file: File) => Promise<string>;
}) {
  const editor = useEditor();
  const patchedRef = useRef(false);
  const editingRef = useRef(false);
  const editorValueRef = useRef(value || "\n");
  const receivedValueRef = useRef(value);

  // Editable reparses a changed `value` and moves the Slate selection to the
  // document start. Dashboard state can rerender while the user only moves
  // the caret, so keep the editor-owned value authoritative while focused.
  // Changes originating here update the ref before notifying the parent.
  if (!editingRef.current && value !== receivedValueRef.current) {
    editorValueRef.current = value || "\n";
  }
  receivedValueRef.current = value;

  if (!patchedRef.current) {
    patchedRef.current = true;
    const slateEditor = editor as unknown as SlateEditor;
    const originalNormalizeNode = slateEditor.normalizeNode;
    slateEditor.normalizeNode = (entry: SlateEntry) => {
      const [, path] = entry;
      if (path.length === 0 && slateEditor.children.length === 0) {
        slateEditor.children = [{
          type: "paragraph",
          children: [{ text: "" }],
        }];
      }
      originalNormalizeNode(entry);
    };
  }

  return (
    <div
      className="wysiwyg-host"
      onFocusCapture={() => {
        editingRef.current = true;
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          editingRef.current = false;
        }
      }}
    >
      <Editable
        editor={editor}
        value={editingRef.current ? editorValueRef.current : value || "\n"}
        onChange={(next: string) => {
          editorValueRef.current = next;
          receivedValueRef.current = next;
          onChange(next);
        }}
        onImageChange={onImageChange}
        placeholder="Write Markdown..."
      />
    </div>
  );
}
