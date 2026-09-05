import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";

// Define the shape of a turn from the agent
const TurnSchema = z.object({
  sessionId: z.string().optional(),
  llm: z.object({
    intent: z.object({
      used: z.boolean(),
      provider: z.string().optional(),
      model: z.string().optional(),
      fallback: z.boolean().optional(),
      reason: z.string().optional(),
    }),
    reply: z.object({
      used: z.boolean(),
      provider: z.string().optional(),
      model: z.string().optional(),
      fallback: z.boolean().optional(),
      reason: z.string().optional(),
    }),
  }).optional(),
  data: z.object({
    negotiation: z.object({
      decision: z.object({
        reasons: z.array(z.string()).optional(),
      }).optional(),
      offer: z.object({
        offerId: z.string().optional(),
      }).optional(),
      quote: z.object({
        offerId: z.string().optional(),
      }).optional(),
    }).optional(),
    approval: z.object({
      approvalId: z.string().optional(),
    }).optional(),
  }).optional(),
  action: z.string().optional(),
  reply: z.string().optional(),
  explainability: z.string().optional(),
  timestamp: z.string().optional(),
  actor: z.string().optional(),
  phase: z.string().optional(),
});

type Turn = z.infer<typeof TurnSchema>;

function normalizeHistory(data: unknown): Turn[] {
  if (!Array.isArray(data)) return [];
  return data.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as { role?: string; content?: string; structured?: unknown };
    const structured = item.structured && typeof item.structured === "object" ? item.structured : {};
    return [{ ...structured, reply: item.content ?? "", actor: item.role === "assistant" ? "merchant" : "buyer" } as Turn];
  });
}

export function useChat() {
  const queryClient = useQueryClient();
  const [chatSession, setChatSession] = useState<string | null>(null);
  const [messages, setMessages] = useState<Turn[]>([]);

  useEffect(() => {
    const reset = () => { setChatSession(null); setMessages([]); };
    window.addEventListener("aegis-demo-reset", reset);
    return () => window.removeEventListener("aegis-demo-reset", reset);
  }, []);

  // Fetch chat history if we have a session
  const { data: historyData, isLoading: isHistoryLoading, error: historyError, refetch: retryHistory } = useQuery({
    queryKey: ["chat-history", chatSession],
    queryFn: async () => {
      if (!chatSession) return [];
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/agent/history?sessionId=${encodeURIComponent(chatSession)}`);
      if (!res.ok) throw new Error("Failed to fetch chat history");
      const data = await res.json();
      // The API returns { sessionId, messages }
      return normalizeHistory(data.messages);
    },
    enabled: !!chatSession,
  });

  // Mutation for sending a message
  const sendMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/agent/message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message,
          ...(chatSession ? { sessionId: chatSession } : {}),
        }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to send message");
      }
      return res.json();
    },
    onSuccess: (data) => {
      const response = TurnSchema.parse(data);
      // Update session if we got one
      if (response.sessionId) {
        setChatSession(response.sessionId);
      }
      // Add the turn to messages
      setMessages((prev) => [...prev, { ...response, actor: "merchant" }]);
      // Invalidate history to refetch
      queryClient.invalidateQueries({ queryKey: ["chat-history", chatSession] });
    },
    onError: (error) => {
      console.error("Error sending message:", error);
      // We could add an error message to the chat here
    },
  });

  // Function to send a message
  const handleSendMessage = (message: string) => {
    const text = message.trim();
    if (!text || sendMessageMutation.isPending) return;
    setMessages((prev) => [...prev, { reply: text, actor: "buyer" }]);
    sendMessageMutation.mutate(text);
  };

  return {
    messages: historyData ?? messages,
    isLoading: isHistoryLoading || sendMessageMutation.isPending,
    sendMessage: handleSendMessage,
    session: chatSession,
    error: sendMessageMutation.error ?? historyError,
    retry: retryHistory,
  };
}