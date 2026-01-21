/**
 * TalkToEvroc Client - Swedish Voice Bot
 *
 * Simple voice assistant interface with chat history.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { usePipecatClientTransportState } from "@pipecat-ai/client-react";
import type {
  TranscriptData,
  RTVIMessage,
  BotLLMTextData,
} from "@pipecat-ai/client-js";
import {
  WebSocketPipecatAppBase,
  type WebSocketPipecatBaseChildProps,
} from "./WebSocketPipecatAppBase";
import "./styles.css";

type ChatMessage = {
  role: "user" | "bot";
  text: string;
};

// Use a ref-based approach to avoid callback dependency issues
const messageHandlers = {
  appendMessage: null as ((role: "user" | "bot", text: string) => void) | null,
  clearMessages: null as (() => void) | null,
};

// Inner component that uses the Pipecat hooks
function TalkToEvrocUI({
  client,
  handleConnect,
  handleDisconnect,
  isConnecting,
  messages,
}: WebSocketPipecatBaseChildProps & { messages: ChatMessage[] }) {
  const transportState = usePipecatClientTransportState();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const isConnected = transportState === "ready";
  const isConnectingState = isConnecting || transportState === "connecting";

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleButtonClick = async () => {
    if (isConnected) {
      await handleDisconnect?.();
    } else if (!isConnectingState) {
      await handleConnect?.();
    }
  };

  const getButtonText = () => {
    if (isConnectingState) return "Ansluter...";
    if (isConnected) return "Avsluta";
    return "Starta";
  };

  const isButtonDisabled = !client || isConnectingState;

  return (
    <div className="container">
      <button
        className={`main-button ${isConnected ? "connected" : ""} ${isConnectingState ? "connecting" : ""}`}
        onClick={handleButtonClick}
        disabled={isButtonDisabled}
      >
        {getButtonText()}
      </button>

      {messages.length > 0 && (
        <div className="chat-history">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-message ${msg.role}`}>
              <span className="chat-role">
                {msg.role === "user" ? "👤" : "🤖"}
              </span>
              <span className="chat-text">{msg.text}</span>
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Store handlers in ref object so callbacks don't need to be recreated
  messageHandlers.appendMessage = (role: "user" | "bot", text: string) => {
    setMessages((prev) => {
      // If last message is from same role, append to it
      if (prev.length > 0 && prev[prev.length - 1].role === role) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...updated[updated.length - 1],
          text: updated[updated.length - 1].text + " " + text.trim(),
        };
        return updated;
      }
      // Otherwise add new message
      return [...prev, { role, text: text.trim() }];
    });
  };

  messageHandlers.clearMessages = () => setMessages([]);

  // Memoize callbacks to prevent useEffect re-runs in WebSocketPipecatAppBase
  const callbacks = useMemo(
    () => ({
      onConnected: () => {
        console.log("[TalkToEvroc] Connected!");
        messageHandlers.clearMessages?.();
      },
      onDisconnected: () => {
        console.log("[TalkToEvroc] Disconnected");
      },
      onBotReady: () => {
        console.log("[TalkToEvroc] Bot ready");
      },
      onUserTranscript: (data: TranscriptData) => {
        if (data.final) {
          console.log(`[👤 User] ${data.text}`);
          messageHandlers.appendMessage?.("user", data.text);
        }
      },
      onBotTranscript: (data: BotLLMTextData) => {
        console.log(`[🤖 Bot] ${data.text}`);
        messageHandlers.appendMessage?.("bot", data.text);
      },
      onMessageError: (error: RTVIMessage) => {
        console.error("[TalkToEvroc] Message error:", error);
      },
      onError: (error: RTVIMessage) => {
        console.error("[TalkToEvroc] Error:", error);
      },
    }),
    [], // Empty deps - callbacks are stable, use messageHandlers ref for state updates
  );

  return (
    <WebSocketPipecatAppBase
      connectEndpoint="/connect"
      initDevicesOnMount={false}
      callbacks={callbacks}
    >
      {(props) => <TalkToEvrocUI {...props} messages={messages} />}
    </WebSocketPipecatAppBase>
  );
}
