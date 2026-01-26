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

const GITHUB_REPO_URL = "https://github.com/oloflarsson/TalkToEvroc";

// GitHub icon SVG component
function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// Use a ref-based approach to avoid callback dependency issues
const messageHandlers = {
  appendMessage: null as ((role: "user" | "bot", text: string) => void) | null,
  clearMessages: null as (() => void) | null,
};

// Inner component that uses the Pipecat hooks - only rendered when client exists
function ConnectedUI({
  handleDisconnect,
  messages,
}: {
  handleDisconnect?: () => Promise<void>;
  messages: ChatMessage[];
}) {
  const transportState = usePipecatClientTransportState();
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Transport state can be: 'disconnected', 'initializing', 'initialized', 'connecting', 'connected', 'ready', 'disconnecting', 'error'
  // We're "connected" only when ready AND we've received a bot message
  // This prevents the confusing "connected but empty" state
  const isTransportReady = transportState === "ready";
  const hasReceivedBotMessage = messages.some((msg) => msg.role === "bot");
  const isConnected = isTransportReady && hasReceivedBotMessage;
  const isConnecting = !isConnected;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Disconnect is instant - no waiting, just trigger it
  const handleButtonClick = () => {
    if (isConnected) {
      handleDisconnect?.();
    }
  };

  const getButtonText = () => {
    if (isConnecting) return "Ansluter...";
    return "Avsluta";
  };

  return (
    <div className="container">
      <button
        className={`main-button ${isConnected ? "connected" : ""} ${isConnecting ? "connecting" : ""}`}
        onClick={handleButtonClick}
        disabled={isConnecting}
      >
        {getButtonText()}
      </button>

      {/* Show chat box when connected, even if empty */}
      {isConnected && (
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

// Disconnected UI - shown when no client exists (no provider context)
function DisconnectedUI({
  handleConnect,
  isConnecting,
  messages,
}: {
  handleConnect?: () => Promise<void>;
  isConnecting?: boolean;
  messages: ChatMessage[];
}) {
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleButtonClick = async () => {
    if (!isConnecting) {
      await handleConnect?.();
    }
  };

  return (
    <div className="container">
      <button
        className={`main-button ${isConnecting ? "connecting" : ""}`}
        onClick={handleButtonClick}
        disabled={isConnecting}
      >
        {isConnecting ? "Ansluter..." : "Starta"}
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

// Main UI component that switches between connected and disconnected states
function TalkToEvrocUI({
  client,
  handleConnect,
  handleDisconnect,
  isConnecting,
  messages,
}: WebSocketPipecatBaseChildProps & { messages: ChatMessage[] }) {
  // When client exists, we're inside the provider and can use hooks
  // When client is null, we're outside the provider
  if (client) {
    return (
      <ConnectedUI handleDisconnect={handleDisconnect} messages={messages} />
    );
  }

  return (
    <DisconnectedUI
      handleConnect={handleConnect}
      isConnecting={isConnecting}
      messages={messages}
    />
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
    <>
      <a
        href={GITHUB_REPO_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="github-link"
        aria-label="View source on GitHub"
      >
        <GitHubIcon />
      </a>
      <WebSocketPipecatAppBase
        connectEndpoint="/connect"
        initDevicesOnMount={false}
        callbacks={callbacks}
      >
        {(props) => <TalkToEvrocUI {...props} messages={messages} />}
      </WebSocketPipecatAppBase>
    </>
  );
}
