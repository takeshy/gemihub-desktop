import { type FormEvent, useEffect, useState } from "react";
import { Download, Loader2, LockKeyhole, Save, X } from "lucide-react";
import { PdfViewer } from "./PdfViewer";
import { WysiwygEditor } from "./WysiwygEditor";
import { epubToHtml } from "../lib/epub";
import { useI18n } from "../i18n/context";
import {
  type DecryptedWorkspaceFile,
  decryptWorkspaceFile,
  openEncryptedWorkspaceFile,
  rememberedFilePassword,
  saveEncryptedWorkspaceFile,
} from "../lib/fileEncryption";
import type { FileRef } from "../lib/fileRef";

function extension(name: string): string {
  return name.split(".").pop()?.toLowerCase() || "";
}

export function EncryptedFileModal(
  { file: sourceFile, onClose, onChanged }: {
    file: FileRef;
    onClose: () => void;
    onChanged: () => void;
  },
) {
  const { t: tr } = useI18n();
  const [password, setPassword] = useState(() =>
    rememberedFilePassword(sourceFile)
  );
  const [file, setFile] = useState<DecryptedWorkspaceFile | null>(null);
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [epubHtml, setEpubHtml] = useState("");

  const unlock = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!password) return;
    setBusy(true);
    setError("");
    try {
      const opened = await openEncryptedWorkspaceFile(sourceFile, password);
      setFile(opened);
      setContent(opened.content);
      setDirty(false);
    } catch {
      setError(tr("encrypted.unlockFailed"));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (password) void unlock();
  }, []);

  const save = async () => {
    if (!file || !password) return;
    setBusy(true);
    setError("");
    try {
      setFile(await saveEncryptedWorkspaceFile(file, content, password));
      setDirty(false);
      onChanged();
    } catch {
      setError(tr("encrypted.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const permanentlyDecrypt = async () => {
    if (
      !file || !password ||
      !confirm(
        tr("encrypted.decryptConfirm").replace("{name}", file.originalName),
      )
    ) return;
    setBusy(true);
    try {
      await decryptWorkspaceFile(sourceFile, password);
      onChanged();
      onClose();
    } catch {
      setError(tr("encrypted.decryptFailed"));
      setBusy(false);
    }
  };

  const setEdited = (value: string) => {
    setContent(value);
    setDirty(value !== file?.content);
  };
  const ext = extension(file?.originalName || "");
  const binaryPreview = !!file &&
    (file.mimeType.startsWith("image/") || file.mimeType.startsWith("audio/") ||
      file.mimeType.startsWith("video/") || ext === "pdf" || ext === "epub");

  useEffect(() => {
    if (!file || ext !== "epub" || !content.startsWith("data:")) {
      setEpubHtml("");
      return;
    }
    let cancelled = false;
    void fetch(content).then((response) => response.blob()).then((blob) =>
      epubToHtml(new File([blob], file.originalName, { type: file.mimeType }))
    ).then((html) => {
      if (!cancelled) setEpubHtml(html);
    }).catch(() => {
      if (!cancelled) setError(tr("encrypted.epubFailed"));
    });
    return () => {
      cancelled = true;
    };
  }, [content, ext, file]);

  return (
    <div
      className="encrypted-file-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="encrypted-file-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Encrypted file"
      >
        <header>
          <span>
            <LockKeyhole size={16} />
            {file?.originalName || sourceFile.path.split("/").pop()}
          </span>
          <button type="button" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </header>
        {!file
          ? (
            <form className="encrypted-file-unlock" onSubmit={unlock}>
              <LockKeyhole size={30} />
              <p>{tr("encrypted.passwordPrompt")}</p>
              <input
                autoFocus
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
              />
              {error && <p className="dashboard-widget-error">{error}</p>}
              <button
                className="primary"
                type="submit"
                disabled={busy || !password}
              >
                {busy
                  ? <Loader2 className="spin" size={15} />
                  : tr("common.open")}
              </button>
            </form>
          )
          : (
            <>
              <div className="encrypted-file-editor">
                {file.mimeType.startsWith("image/")
                  ? <img src={content} alt={file.originalName} />
                  : file.mimeType.startsWith("audio/")
                  ? <audio src={content} controls />
                  : file.mimeType.startsWith("video/")
                  ? <video src={content} controls />
                  : ext === "pdf"
                  ? (
                    <PdfViewer
                      content={content}
                      title={file.originalName}
                      scalePercent={100}
                    />
                  )
                  : ext === "epub"
                  ? (
                    <iframe
                      title={file.originalName}
                      srcDoc={epubHtml}
                      sandbox="allow-same-origin"
                    />
                  )
                  : ext === "md" || ext === "markdown"
                  ? <WysiwygEditor value={content} onChange={setEdited} />
                  : ext === "html" || ext === "htm"
                  ? (
                    <iframe
                      title={file.originalName}
                      srcDoc={content}
                      sandbox="allow-same-origin"
                    />
                  )
                  : (
                    <textarea
                      value={content}
                      onChange={(event) => setEdited(event.target.value)}
                      spellCheck={false}
                    />
                  )}
              </div>
              {error && (
                <p className="dashboard-widget-error encrypted-file-error">
                  {error}
                </p>
              )}
              <footer>
                <small>
                  {binaryPreview
                    ? tr("encrypted.previewOnly")
                    : dirty
                    ? tr("encrypted.unsaved")
                    : tr("encrypted.saved")}
                </small>
                <button
                  type="button"
                  onClick={() => void permanentlyDecrypt()}
                  disabled={busy}
                >
                  <Download size={14} />
                  {tr("encrypted.permanentDecrypt")}
                </button>
                <button
                  type="button"
                  className="primary"
                  onClick={() => void save()}
                  disabled={busy || !dirty || binaryPreview}
                >
                  <Save size={14} />
                  {tr("common.save")}
                </button>
              </footer>
            </>
          )}
      </section>
    </div>
  );
}
