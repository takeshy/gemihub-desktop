import { useRef } from "react";
import { Editable, useEditor } from "wysimark-lite";

type SlateEntry = [unknown, number[]];
type SlateEditor = ReturnType<typeof useEditor> & {
  children: unknown[];
  normalizeNode: (entry: SlateEntry) => void;
};

export function WysiwygEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const editor = useEditor();
  const patchedRef = useRef(false);

  if (!patchedRef.current) {
    patchedRef.current = true;
    const slateEditor = editor as unknown as SlateEditor;
    const originalNormalizeNode = slateEditor.normalizeNode;
    slateEditor.normalizeNode = (entry: SlateEntry) => {
      const [, path] = entry;
      if (path.length === 0 && slateEditor.children.length === 0) {
        slateEditor.children = [{ type: "paragraph", children: [{ text: "" }] }];
      }
      originalNormalizeNode(entry);
    };
  }

  return (
    <div className="wysiwyg-host">
      <Editable
        editor={editor}
        value={value || "\n"}
        onChange={onChange}
        placeholder="Write Markdown..."
      />
    </div>
  );
}
