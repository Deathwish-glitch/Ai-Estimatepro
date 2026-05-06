import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useBuildCalc } from "@/context/BuildCalcContext";
import { createChatSessionApi, getChatHistoryApi, sendChatMessageApi } from "@/services/api";

const CHAT_SESSION_KEY = "ai-estimate-pro-chat-session";

const safeSessionGet = (key) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const safeSessionSet = (key, value) => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // no-op if storage is unavailable
  }
};

export const ChatAssistant = () => {
  const { latestEstimate, latestInput } = useBuildCalc();
  const [isOpen, setIsOpen] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const projectContext = useMemo(() => {
    if (!latestEstimate || !latestInput) {
      return "No estimate generated yet. User may ask about app usage or estimate guidance.";
    }
    return [
      `Building Type: ${latestInput.building_type}`,
      `Location: ${latestInput.location}`,
      `Floors: ${latestInput.floors}`,
      `Built-up Area: ${latestInput.built_up_area_sqft} sq.ft`,
      `Total Estimate: ₹${latestEstimate.cost_breakdown.total_estimate}`,
      `Duration: ${latestEstimate.duration_weeks} weeks`,
    ].join(" | ");
  }, [latestEstimate, latestInput]);

  const initSession = useCallback(async () => {
    try {
      const storedSessionId = safeSessionGet(CHAT_SESSION_KEY);
      if (storedSessionId) {
        setSessionId(storedSessionId);
        const history = await getChatHistoryApi(storedSessionId);
        setMessages(history.data || []);
        return;
      }

      const created = await createChatSessionApi();
      safeSessionSet(CHAT_SESSION_KEY, created.data.session_id);
      setSessionId(created.data.session_id);
    } catch {
      const fallbackSessionId = `local-${Date.now()}`;
      safeSessionSet(CHAT_SESSION_KEY, fallbackSessionId);
      setSessionId(fallbackSessionId);
    }
  }, []);

  useEffect(() => {
    initSession();
  }, [initSession]);

  const onSendMessage = async () => {
    if (!input.trim() || !sessionId || loading) return;
    const userText = input.trim();

    const optimisticUser = {
      id: `local-user-${Date.now()}`,
      role: "user",
      text: userText,
      created_at: new Date().toISOString(),
      session_id: sessionId,
    };
    setMessages((previous) => [...previous, optimisticUser]);
    setInput("");
    setLoading(true);

    try {
      const response = await sendChatMessageApi({
        session_id: sessionId,
        message: userText,
        project_context: projectContext,
      });

      const assistantMessage = {
        id: `local-assistant-${Date.now()}`,
        role: "assistant",
        text: response.data.reply,
        created_at: response.data.created_at,
        session_id: sessionId,
      };
      setMessages((previous) => [...previous, assistantMessage]);
    } catch {
      setMessages((previous) => [
        ...previous,
        {
          id: `local-error-${Date.now()}`,
          role: "assistant",
          text: "I couldn't respond right now. Please try again in a few seconds.",
          created_at: new Date().toISOString(),
          session_id: sessionId,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-24 right-4 z-50 sm:right-6" data-testid="chat-assistant-root">
      {isOpen ? (
        <Card className="w-[min(92vw,380px)] border-slate-200 bg-white shadow-xl" data-testid="chat-assistant-panel">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg" data-testid="chat-assistant-title">
              <Bot size={18} className="text-orange-500" /> AI Help Bot
            </CardTitle>
            <button
              type="button"
              className="rounded-full p-2 text-slate-500 transition-colors duration-200 hover:bg-slate-100"
              onClick={() => setIsOpen(false)}
              data-testid="chat-assistant-close-button"
            >
              <X size={16} />
            </button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="max-h-72 min-h-64 space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3"
              data-testid="chat-assistant-messages-container"
            >
              {!messages.length ? (
                <p className="text-sm text-slate-500" data-testid="chat-assistant-empty-text">
                  Ask me about estimation, materials, schedule, or how to use AI Estimate Pro.
                </p>
              ) : null}
              {messages.map((message, index) => (
                <div
                  key={message.id}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    message.role === "user" ? "ml-8 bg-slate-900 text-white" : "mr-8 bg-white text-slate-700"
                  }`}
                  data-testid={`chat-message-${message.role}-${index}`}
                >
                  {message.text}
                </div>
              ))}
              {loading ? (
                <div className="mr-8 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm text-slate-600" data-testid="chat-loading-indicator">
                  <Loader2 size={14} className="animate-spin" /> Thinking...
                </div>
              ) : null}
            </div>
            <div className="flex gap-2" data-testid="chat-assistant-input-row">
              <Input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") onSendMessage();
                }}
                placeholder="Ask your construction question..."
                data-testid="chat-assistant-input"
              />
              <Button
                type="button"
                onClick={onSendMessage}
                disabled={loading || !input.trim()}
                className="rounded-full bg-orange-500 px-4 transition-colors duration-200 hover:bg-orange-600"
                data-testid="chat-assistant-send-button"
              >
                <Send size={14} />
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Button
        className="rounded-full bg-slate-900 px-5 shadow-lg transition-colors duration-200 hover:bg-slate-800"
        onClick={() => setIsOpen((previous) => !previous)}
        data-testid="chat-assistant-toggle-button"
      >
        <MessageCircle size={16} /> Ask AI Help
      </Button>
    </div>
  );
};