import { useState } from "react";
import ChatTab from "@/components/agent-theater/chat-tab";
import A2ATab from "@/components/agent-theater/a2a-tab";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export default function AgentTheater() {
  const [activeTab, setActiveTab] = useState<"chat" | "a2a">("chat");

  return (
    <div className="flex flex-col h-full">
      <div className="flex h-10 items-center justify-between px-4 pt-2 border-b border-line/20">
        <h2 className="text-lg font-semibold text-ink">Terminal</h2>
        <div className="flex items-center gap-2 text-sm text-ink-3">
          <span className="h-2 w-2 rounded-full bg-merchant"></span>
          <span>Interactive prompt</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="chat" orientation="vertical" className="w-full">
          <TabsList className="border-b border-line/20">
            <TabsTrigger
              value="chat"
              active={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
              className="flex h-10 w-full items-center justify-between px-4 text-sm font-medium text-ink-3 hover:text-ink hover:bg-surface/50"
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-merchant"></span>
                Talk to the merchant agent
              </span>
            </TabsTrigger>
            <TabsTrigger
              value="a2a"
              active={activeTab === "a2a"}
              onClick={() => setActiveTab("a2a")}
              className="flex h-10 w-full items-center justify-between px-4 text-sm font-medium text-ink-3 hover:text-ink hover:bg-surface/50"
            >
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-buyer"></span>
                A2A · buyer ⇄ merchant
              </span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="chat" className="flex-1 overflow-hidden p-4">
            <ChatTab />
          </TabsContent>
          <TabsContent value="a2a" className="flex-1 overflow-hidden p-4">
            <A2ATab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}