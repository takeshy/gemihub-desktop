import { useCallback, useEffect, useRef, useState } from "react";
// wysimark-lite is derived from portive/wysimark under the MIT License.
// See THIRD_PARTY_NOTICES.md for attribution and the full license text.
import { Editable, useEditor } from "wysimark-lite";
import { WorkspaceFilePicker } from "./WorkspaceFilePicker";
import {
  resolveWorkspaceMarkdownImage,
  workspaceRelativePath,
} from "../lib/markdownWorkspaceAssets";

type SlateEntry = [unknown, number[]];
type SlateEditor = ReturnType<typeof useEditor> & {
  children: unknown[];
  normalizeNode: (entry: SlateEntry) => void;
};

export function WysiwygEditor({
  value,
  onChange,
  onImageChange,
  workspaceSourcePath,
}: {
  value: string;
  onChange: (value: string) => void;
  onImageChange?: (file: File) => Promise<string>;
  workspaceSourcePath?: string;
}) {
  const editor = useEditor({ enableInternalLinks: !!workspaceSourcePath });
  const patchedRef = useRef(false);
  const editingRef = useRef(false);
  const editorValueRef = useRef(value || "\n");
  const receivedValueRef = useRef(value);
  const pickerResolverRef = useRef<((path: string | null) => void) | null>(
    null,
  );
  const [pickerKind, setPickerKind] = useState<"image" | "link" | null>(null);

  const pickWorkspaceFile = useCallback((kind: "image" | "link") => {
    pickerResolverRef.current?.(null);
    setPickerKind(kind);
    return new Promise<string | null>((resolve) => {
      pickerResolverRef.current = resolve;
    });
  }, []);
  const closePicker = useCallback(() => {
    setPickerKind(null);
    pickerResolverRef.current?.(null);
    pickerResolverRef.current = null;
  }, []);
  useEffect(() => () => pickerResolverRef.current?.(null), []);

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
        onFileSelect={workspaceSourcePath
          ? async () => {
            const selected = await pickWorkspaceFile("image");
            return selected
              ? workspaceRelativePath(workspaceSourcePath, selected)
              : null;
          }
          : undefined}
        onLinkSelect={workspaceSourcePath
          ? () => pickWorkspaceFile("link")
          : undefined}
        resolveImageSrc={workspaceSourcePath
          ? (url: string) =>
            resolveWorkspaceMarkdownImage(workspaceSourcePath, url)
          : undefined}
        placeholder="Write Markdown..."
      />
      {pickerKind && (
        <WorkspaceFilePicker
          imagesOnly={pickerKind === "image"}
          onClose={closePicker}
          onSelect={(path) => {
            const resolve = pickerResolverRef.current;
            pickerResolverRef.current = null;
            setPickerKind(null);
            resolve?.(path);
          }}
        />
      )}
    </div>
  );
}
