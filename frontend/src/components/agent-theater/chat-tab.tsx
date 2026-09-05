import { useState, useEffect } from "react";
import { useChat } from "@/lib/hooks/use-chat";
import ChipRow from "./chip-row";
import Composer from "./composer";
import ChatLog from "./chat-log";
import { useLLMStatus } from "@/lib/context/llm-status-context";
import { Search } from "lucide-react";

export default function ChatTab() {
  const { messages, isLoading, sendMessage, error } = useChat();
  const [inputValue, setInputValue] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [showLLMStats, setShowLLMStats] = useState(false);

  const handleSendMessage = () => {
    if (inputValue.trim()) {
      sendMessage(inputValue);
      setInputValue("");
    }
  };

  // Expose LLM usage status to parent components via context
  const { setLLMUsed } = useLLMStatus();

  useEffect(() => {
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      const llmUsed = lastMessage.llm?.intent?.used === true || lastMessage.llm?.reply?.used === true;
      setLLMUsed(llmUsed);
    }
  }, [messages, setLLMUsed]);

  // Filter messages based on search term
  const filteredMessages = messages.filter(message => {
    if (!searchTerm.trim()) return true;
    const searchableText = [
      message.reply,
      message.explainability,
      message.action,
      message.actor,
      message.phase,
      message.data?.negotiation?.decision?.reasons?.join(" "),
      message.data?.negotiation?.offer?.offerId,
      message.data?.negotiation?.quote?.offerId,
      message.data?.approval?.approvalId
    ].filter(Boolean).join(" ").toLowerCase();

    return searchableText.includes(searchTerm.toLowerCase());
  });

  // Count LLM usage in filtered messages
  const llmUsedInFiltered = filteredMessages.filter(
    msg => msg.llm?.intent?.used === true || msg.llm?.reply?.used === true
  ).length;

  return (
    <div className="flex flex-col h-full">
      {error && <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad"><span>{error instanceof Error ? error.message : "The agent service is unavailable."}</span><button onClick={() => window.location.reload()} className="font-semibold underline">Retry</button></div>}

      {/* Header with LLM stats */}
      <div className="flex flex-wrap items-center justify-between px-4 pt-2 border-b border-line/20">
        <h2 className="text-lg font-semibold text-ink">Terminal</h2>
        <div className="flex items-center gap-2 text-sm text-ink-3">
          <span className="h-2 w-2 rounded-full bg-merchant"></span>
          <span>Interactive prompt</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button
            onClick={() => setShowLLMStats(!showLLMStats)}
            className={`flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium ${showLLMStats ? 'text-brand bg-brand/10' : 'text-ink-2 hover:text-brand hover:bg-brand/10'}`}
          >
            LLM Usage: {llmUsedInFiltered}/{filteredMessages.length} ({filteredMessages.length > 0 ? Math.round((llmUsedInFiltered / filteredMessages.length) * 100) : 0}%)
          </button>
        </div>
      </div>

      {showLLMStats && (
        <div className="px-4 pt-2">
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span>Total messages:</span>
              <span className="font-mono">{filteredMessages.length}</span>
            </div>
            <div className="flex justify-between">
              <span>LLM-assisted:</span>
              <span className="font-mono text-warn">{llmUsedInFiltered}</span>
            </div>
            <div className="flex justify-between">
              <span>Deterministic only:</span>
              <span className="font-mono text-ok">{filteredMessages.length - llmUsedInFiltered}</span>
            </div>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center gap-2 p-4 bg-surface/50 rounded-lg border border-line/20">
        <Search className="h-4 w-4 text-ink-3" />
        <input
          aria-label="Search conversation"
          type="text"
          placeholder="Search conversation..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 min-w-0 border-none bg-transparent text-sm text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-0"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm("")}
            className="text-ink-2 hover:text-ink hover:bg-surface/100 rounded-full p-1"
            aria-label="Clear search"
          >
            <span className="sr-only">Clear search</span>
          </button>
        )}
      </div>

      {/* Chat Log */}
      <ChatLog
        messages={filteredMessages}
        className="flex-1 overflow-y-auto p-4"
      />

      {/* Suggested Chips */}
      {!isLoading && filteredMessages.length === 0 && (
        <ChipRow className="flex flex-wrap gap-2 p-4 bg-surface/50 rounded-lg border border-line/20">
          <button
            onClick={() => {
              handleSendMessageWithSuggestion("What do you sell?", sendMessage);
              setSearchTerm("");
            }}
            className="flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-ink-2 hover:text-brand hover:bg-brand/10 transition-all"
          >
            What do you sell?
          </button>
          <button
            onClick={() => {
              handleSendMessageWithSuggestion("Quote 2 keyboards at 10% off", sendMessage);
              setSearchTerm("");
            }}
            className="flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-ink-2 hover:text-brand hover:bg-brand/10 transition-all"
          >
            Quote 2 keyboards at 10% off
          </button>
          <button
            onClick={() => {
              handleSendMessageWithSuggestion("I want 5 mice at 30% off", sendMessage);
              setSearchTerm("");
            }}
            className="flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-ink-2 hover:text-brand hover:bg-brand/10 transition-all"
          >
            I want 5 mice at 30% off
          </button>
          <button
            onClick={() => {
              handleSendMessageWithSuggestion("Set a budget of ₹5000", sendMessage);
              setSearchTerm("");
            }}
            className="flex h-9 items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium text-ink-2 hover:text-brand hover:bg-brand/10 transition-all"
          >
            Set a budget of ₹5000
          </button>
        </ChipRow>
      )}

      {/* Composer */}
      <Composer
        value={inputValue}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setInputValue(e.target.value)}
        onSend={handleSendMessage}
        disabled={isLoading}
        className="mt-4"
      />
    </div>
  );
}

function handleSendMessageWithSuggestion(message: string, sendFn: (msg: string) => void) {
  if (message.trim()) {
    sendFn(message);
  }
}