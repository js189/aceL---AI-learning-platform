"use client";

import { useState, useRef, useEffect } from "react";
import { Send, ImagePlus, X } from "lucide-react";

const MAX_IMAGE_SIZE_MB = 10;
const MAX_IMAGE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

export function TutorChat({
  conceptTitle,
  conceptContext,
  onClose,
}: {
  conceptTitle: string;
  conceptContext?: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<{ role: "user" | "assistant"; content: string; imagePreview?: string }[]>([]);
  const [input, setInput] = useState("");
  const [attachImage, setAttachImage] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [position, setPosition] = useState({ x: 50, y: 100 });
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    function check() {
      const mobile = window.innerWidth < 640;
      setIsMobile(mobile);
      if (!mobile) {
        setPosition((p) => ({ ...p, x: window.innerWidth - 420, y: 100 }));
      }
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  const [size, setSize] = useState({ w: 380, h: 450 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPosition({
          x: Math.max(0, Math.min(window.innerWidth - 100, dragStart.current.posX + dx)),
          y: Math.max(0, Math.min(window.innerHeight - 100, dragStart.current.posY + dy)),
        });
      }
      if (isResizing) {
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        setSize({
          w: Math.max(280, Math.min(600, resizeStart.current.w + dx)),
          h: Math.max(300, Math.min(700, resizeStart.current.h + dy)),
        });
      }
    };
    const onMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging, isResizing]);

  async function send() {
    const text = input.trim();
    if ((!text && !attachImage) || loading) return;
    const userMessage = text || "(Sent an image)";
    const imageToSend = attachImage;
    setInput("");
    setAttachImage(null);
    const imagePreview = attachImage ? URL.createObjectURL(attachImage) : undefined;
    setMessages((m) => [...m, { role: "user", content: userMessage, imagePreview }]);
    setLoading(true);
    try {
      let res: Response;
      if (imageToSend) {
        const formData = new FormData();
        formData.append("conceptTitle", conceptTitle);
        if (conceptContext) formData.append("conceptContext", conceptContext);
        formData.append("messages", JSON.stringify([...messages, { role: "user", content: userMessage }]));
        formData.append("file", imageToSend);
        res = await fetch("/api/tutor", { method: "POST", body: formData });
      } else {
        res = await fetch("/api/tutor", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conceptTitle,
            conceptContext,
            messages: [...messages, { role: "user", content: userMessage }],
          }),
        });
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply ?? "I'm here to help. What would you like to try?" },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const validTypes = ["image/png", "image/jpeg", "image/jpg"];
    if (!validTypes.includes(file.type)) {
      alert("Please choose a PNG or JPG image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      alert(`Image must be under ${MAX_IMAGE_SIZE_MB}MB.`);
      return;
    }
    setAttachImage(file);
  }

  return (
    <div
      ref={panelRef}
      className={`fixed z-20 flex flex-col bg-cream ${isMobile ? "inset-0 rounded-none max-h-[100dvh]" : "rounded-card border border-warm-sand/80 shadow-hover"}`}
      style={!isMobile ? { left: position.x, top: position.y, width: size.w, height: size.h } : undefined}
    >
      <div
        className={`flex items-center justify-between border-b border-warm-sand/80 px-4 py-3 ${!isMobile ? "cursor-move select-none" : ""}`}
        onMouseDown={!isMobile ? (e) => {
          if ((e.target as HTMLElement).closest("button")) return;
          setIsDragging(true);
          dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
        } : undefined}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sage/10 text-sage text-sm">
            🤖
          </div>
          <span className="font-medium text-deep-charcoal">AI Tutor</span>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-2 text-deep-charcoal/60 hover:bg-warm-sand/50 hover:text-deep-charcoal transition"
          aria-label="Close"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 && (
          <p className="text-sm text-deep-charcoal/70">
            Ask anything about &quot;{conceptTitle}&quot;. I&apos;ll guide you step by step.
          </p>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex max-w-[80%] ${
              m.role === "user" ? "ml-auto" : ""
            }`}
          >
            {m.role === "assistant" && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sage/10 text-sage text-xs mr-2">
                🤖
              </div>
            )}
            <div
              className={
                m.role === "user"
                  ? "rounded-card rounded-br-sm bg-dusty-blue/10 px-4 py-3 text-sm text-deep-charcoal"
                  : "rounded-card rounded-bl-sm bg-warm-sand px-4 py-3 text-sm text-deep-charcoal"
              }
            >
              {m.imagePreview && (
                <img src={m.imagePreview} alt="Uploaded" className="mb-2 max-w-full rounded-button max-h-40 object-contain" />
              )}
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-1">
            <span className="h-2 w-2 animate-pulse rounded-full bg-dusty-blue/60" />
            <span className="h-2 w-2 animate-pulse rounded-full bg-dusty-blue/60" style={{ animationDelay: "0.15s" }} />
            <span className="h-2 w-2 animate-pulse rounded-full bg-dusty-blue/60" style={{ animationDelay: "0.3s" }} />
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex flex-col gap-2 border-t border-warm-sand/80 bg-cream/80 p-4 shrink-0"
      >
        {attachImage && (
          <div className="flex items-center gap-2 text-sm text-deep-charcoal/80">
            <span className="truncate flex-1">{attachImage.name}</span>
            <button
              type="button"
              onClick={() => setAttachImage(null)}
              className="rounded-full p-1 hover:bg-warm-sand/50 text-terracotta"
              aria-label="Remove image"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end flex-wrap">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message... You can also attach PNG/JPG images (up to 10MB)"
            rows={2}
            className="flex-1 min-w-0 rounded-input border border-warm-sand/50 bg-cream/50 px-3 py-2 text-deep-charcoal placeholder:text-deep-charcoal/40 focus:outline-none focus:border-dusty-blue/50 resize-none min-h-[44px] max-h-[120px]"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            onChange={handleImageSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-button border-2 border-dashed border-dusty-blue/50 px-3 text-dusty-blue hover:bg-dusty-blue/10 transition font-medium text-sm"
            aria-label="Attach image"
          >
            <ImagePlus size={18} />
            <span className="hidden sm:inline">Image</span>
          </button>
          <button
            type="submit"
            disabled={loading || (!input.trim() && !attachImage)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dusty-blue text-white hover:brightness-95 disabled:opacity-50 transition"
          >
            <Send size={18} />
          </button>
        </div>
      </form>
      {/* Resize handle - hidden on mobile */}
      {!isMobile && (
        <div
          className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize"
          style={{ marginRight: "-2px", marginBottom: "-2px" }}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
            resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
          }}
        >
          <div className="absolute right-1 bottom-1 w-3 h-3 border-r-2 border-b-2 border-deep-charcoal/30 rounded-br" />
        </div>
      )}
    </div>
  );
}
