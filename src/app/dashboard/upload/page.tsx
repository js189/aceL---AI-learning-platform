"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, Camera, Link as LinkIcon, X, Plus } from "lucide-react";

type PendingItem =
  | { type: "notes"; id: string; text: string }
  | { type: "pdf"; id: string; file: File }
  | { type: "image"; id: string; file: File; ocrText?: string }
  | { type: "youtube"; id: string; url: string };

const MAX_COMBINED_CHARS = 24000; // Allow more content for multi-source

export default function UploadPage() {
  const router = useRouter();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [notesText, setNotesText] = useState("");
  const [youtubeUrls, setYoutubeUrls] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");

  const addId = useCallback(() => Math.random().toString(36).slice(2), []);

  function saveTopicAndRedirect(data: {
    topicId?: string | null;
    title: string;
    summary: string;
    concepts: { id: string; title: string }[];
    checklist: { id: string; title: string; completed: boolean; source?: string }[];
  }) {
    const topicId = data.topicId ?? encodeURIComponent(data.title);
    const topics = JSON.parse(localStorage.getItem("adaptive-learning-topics") ?? "[]");
    topics.unshift({
      topicId,
      title: data.title,
      summary: data.summary,
      concepts: data.concepts,
      checklist: data.checklist,
    });
    localStorage.setItem("adaptive-learning-topics", JSON.stringify(topics));
    router.push(`/dashboard/topic/${topicId}`);
  }

  function addPdf(files: FileList | null) {
    if (!files?.length) return;
    const newItems: PendingItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type === "application/pdf") {
        newItems.push({ type: "pdf", id: addId(), file: f });
      }
    }
    setItems((prev) => [...prev, ...newItems]);
    setError("");
  }

  function addImages(files: FileList | null) {
    if (!files?.length) return;
    const newItems: PendingItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith("image/")) {
        newItems.push({ type: "image", id: addId(), file: f });
      }
    }
    setItems((prev) => [...prev, ...newItems]);
    setError("");
  }

  function addNotes() {
    const t = notesText.trim();
    if (!t) return;
    setItems((prev) => [...prev, { type: "notes", id: addId(), text: t }]);
    setNotesText("");
    setError("");
  }

  function addYoutubeUrls() {
    const urls = youtubeUrls
      .split(/[\n,]+/)
      .map((u) => u.trim())
      .filter((u) => /youtube\.com|youtu\.be/i.test(u));
    if (!urls.length) return;
    const newItems: PendingItem[] = urls.map((url) => ({ type: "youtube" as const, id: addId(), url }));
    setItems((prev) => [...prev, ...newItems]);
    setYoutubeUrls("");
    setError("");
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function runOcrForImage(item: Extract<PendingItem, { type: "image" }>): Promise<string> {
    if (item.ocrText) return item.ocrText;
    const form = new FormData();
    form.append("file", item.file);
    const res = await fetch("/api/ocr", { method: "POST", body: form });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "OCR failed");
    return data.text ?? "";
  }

  async function handleAnalyse(e: React.FormEvent) {
    e.preventDefault();

    const hasNotes = notesText.trim().length > 0;
    const hasItems = items.length > 0;
    if (!hasNotes && !hasItems) {
      setError("Add notes, upload files, or add YouTube URLs to analyse.");
      return;
    }

    setError("");
    setLoading(true);
    const parts: string[] = [];

    try {
      // 1. Add notes
      if (notesText.trim()) {
        parts.push(`--- Notes ---\n${notesText.trim()}`);
      }

      // 2. Process PDFs
      const pdfItems = items.filter((i): i is Extract<PendingItem, { type: "pdf" }> => i.type === "pdf");
      for (let i = 0; i < pdfItems.length; i++) {
        setProgress(`Extracting PDF ${i + 1}/${pdfItems.length}…`);
        const form = new FormData();
        form.append("file", pdfItems[i].file);
        const res = await fetch("/api/pdf/extract", { method: "POST", body: form });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`PDF "${pdfItems[i].file.name}": ${data.error || res.statusText}`);
        const text = data.text?.trim() || "";
        if (!text) throw new Error(`No text extracted from "${pdfItems[i].file.name}"`);
        parts.push(`--- PDF: ${pdfItems[i].file.name} ---\n${text}`);
      }

      // 3. Process images (OCR)
      const imageItems = items.filter((i): i is Extract<PendingItem, { type: "image" }> => i.type === "image");
      for (let i = 0; i < imageItems.length; i++) {
        setProgress(`Processing image ${i + 1}/${imageItems.length}…`);
        const text = await runOcrForImage(imageItems[i]);
        if (text) parts.push(`--- Image: ${imageItems[i].file.name} ---\n${text}`);
      }

      // 4. Process YouTube URLs
      const ytItems = items.filter((i): i is Extract<PendingItem, { type: "youtube" }> => i.type === "youtube");
      for (let i = 0; i < ytItems.length; i++) {
        setProgress(`Summarising video ${i + 1}/${ytItems.length}…`);
        const res = await fetch("/api/youtube/summarise", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: ytItems[i].url }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(`YouTube: ${data.error || res.statusText}`);
        const textForAnalyze = [data.summary, data.keyConcepts?.join(". "), data.transcriptSnippet].filter(Boolean).join("\n\n");
        if (textForAnalyze) parts.push(`--- YouTube: ${data.title || "Video"} ---\n${textForAnalyze}`);
      }

      // 5. Add pending notes items
      const notesItems = items.filter((i): i is Extract<PendingItem, { type: "notes" }> => i.type === "notes");
      for (const n of notesItems) {
        parts.push(`--- Notes ---\n${n.text}`);
      }

      if (parts.length === 0) {
        setError("No content could be extracted. Try different files or add notes.");
        setLoading(false);
        return;
      }

      setProgress("Building your learning schedule…");
      const combined = parts.join("\n\n");
      let textToAnalyze = combined.slice(0, MAX_COMBINED_CHARS);
      if (combined.length > MAX_COMBINED_CHARS) {
        textToAnalyze += "\n\n[Content truncated...]";
      }

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToAnalyze, sourceLabel: "mixed" }),
      });
      const analyzeData = await analyzeRes.json().catch(() => ({}));
      if (!analyzeRes.ok) throw new Error(analyzeData.error || "Analysis failed");
      saveTopicAndRedirect(analyzeData);
      setItems([]);
      setNotesText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setProgress("");
    }
  }

  const hasContent = notesText.trim().length > 0 || items.length > 0;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <Link href="/dashboard" className="text-dusty-blue font-medium hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="rounded-card border-2 border-dashed border-dusty-blue/30 bg-warm-sand p-4 sm:p-8 md:p-10">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-dusty-blue/10 text-dusty-blue mb-4">
            <FileText size={48} />
          </div>
          <h1 className="text-xl font-medium text-deep-charcoal">Upload Materials</h1>
          <p className="mt-2 text-deep-charcoal/90">
            Add notes, PDFs, images, and YouTube videos. We&apos;ll combine them into one full learning schedule.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <span className="rounded-full bg-sage/10 px-3 py-1 text-sm text-sage">Notes</span>
            <span className="rounded-full bg-sage/10 px-3 py-1 text-sm text-sage">PDF</span>
            <span className="rounded-full bg-sage/10 px-3 py-1 text-sm text-sage">Images</span>
            <span className="rounded-full bg-sage/10 px-3 py-1 text-sm text-sage">YouTube</span>
          </div>
        </div>

        <div className="mt-6 rounded-card bg-cream p-4 sm:p-6 border border-warm-sand/80">
          {error && (
            <div className="mb-4 rounded-button border border-terracotta/20 bg-terracotta/10 p-4 text-sm text-terracotta">
              {error}
            </div>
          )}

          {/* Add content section */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-deep-charcoal">Notes</label>
              <div className="mt-1 flex flex-col sm:flex-row gap-2">
                <textarea
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  placeholder="Paste your notes, markdown, or typed content..."
                  rows={4}
                  className="flex-1 min-w-0 rounded-input border-2 border-warm-sand/80 bg-cream px-4 py-3 text-deep-charcoal placeholder:text-deep-charcoal/40 focus:border-dusty-blue focus:outline-none transition leading-body"
                />
                <button
                  type="button"
                  onClick={addNotes}
                  disabled={loading || !notesText.trim()}
                  className="shrink-0 self-stretch sm:self-end rounded-button bg-dusty-blue px-4 py-3 sm:py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[44px] sm:min-h-0"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-deep-charcoal">PDF files</label>
              <div className="mt-1 flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-button border-2 border-dashed border-dusty-blue/50 bg-dusty-blue/5 px-5 py-3 text-sm font-medium text-dusty-blue hover:bg-dusty-blue/10 transition">
                  <FileText size={18} />
                  Choose PDF (multiple)
                  <input
                    type="file"
                    accept="application/pdf"
                    multiple
                    onChange={(e) => addPdf(e.target.files)}
                    disabled={loading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-deep-charcoal">Images (JPG, PNG)</label>
              <div className="mt-1 flex flex-wrap gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-button border-2 border-dashed border-dusty-blue/50 bg-dusty-blue/5 px-5 py-3 text-sm font-medium text-dusty-blue hover:bg-dusty-blue/10 transition">
                  <Camera size={18} />
                  Choose images (multiple)
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/heic"
                    multiple
                    onChange={(e) => addImages(e.target.files)}
                    disabled={loading}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-deep-charcoal">YouTube URLs</label>
              <div className="mt-1 flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={youtubeUrls}
                  onChange={(e) => setYoutubeUrls(e.target.value)}
                  placeholder="Paste URLs, one per line"
                  className="flex-1 min-w-0 rounded-input border-2 border-warm-sand/80 bg-cream px-4 py-3 text-deep-charcoal placeholder:text-deep-charcoal/40 focus:border-dusty-blue focus:outline-none min-h-[44px]"
                />
                <button
                  type="button"
                  onClick={addYoutubeUrls}
                  disabled={loading || !youtubeUrls.trim()}
                  className="shrink-0 self-stretch sm:self-end rounded-button bg-dusty-blue px-4 py-3 sm:py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition min-h-[44px] sm:min-h-0"
                >
                  <Plus size={20} />
                </button>
              </div>
            </div>
          </div>

          {/* Collected items */}
          {items.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-medium text-deep-charcoal mb-2">
                Added ({items.length}): {items.length === 1 ? "1 item" : `${items.length} items`}
              </p>
              <div className="flex flex-wrap gap-2">
                {items.map((item) => (
                  <span
                    key={item.id}
                    className="inline-flex items-center gap-2 rounded-full bg-dusty-blue/10 px-3 py-1.5 text-sm text-deep-charcoal"
                  >
                    {item.type === "notes" && <FileText size={14} />}
                    {item.type === "pdf" && <FileText size={14} />}
                    {item.type === "image" && <Camera size={14} />}
                    {item.type === "youtube" && <LinkIcon size={14} />}
                    {item.type === "notes" && "Notes"}
                    {item.type === "pdf" && item.file.name}
                    {item.type === "image" && item.file.name}
                    {item.type === "youtube" && item.url.slice(-11)}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      disabled={loading}
                      className="ml-1 rounded-full p-0.5 hover:bg-dusty-blue/20 text-deep-charcoal/70 hover:text-deep-charcoal disabled:opacity-50"
                      aria-label="Remove"
                    >
                      <X size={14} />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {progress && <p className="mt-4 text-sm text-deep-charcoal/70">{progress}</p>}

          <div className="mt-6 flex flex-col-reverse sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleAnalyse}
              disabled={loading || !hasContent}
              className="rounded-button bg-dusty-blue px-8 py-2.5 text-sm font-medium text-white hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {loading ? "Analysing…" : "Analyse"}
            </button>
            <Link href="/dashboard" className="rounded-button border border-warm-sand px-5 py-2.5 text-sm font-medium text-deep-charcoal hover:bg-warm-sand/30 transition">
              Cancel
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
