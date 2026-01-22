/**
 * WebSocketPipecatAppBase - Custom wrapper for WebSocket transport
 *
 * Simplified version without external theme dependencies.
 * Creates fresh transport/client for each connection to avoid audio issues on reconnect.
 */

import {
  PipecatClient,
  type PipecatClientOptions,
  type RTVIMessage,
} from "@pipecat-ai/client-js";
import {
  PipecatClientProvider,
  PipecatClientAudio,
} from "@pipecat-ai/client-react";
import { WebSocketTransport } from "@pipecat-ai/websocket-transport";
import React, { useCallback, useEffect, useRef, useState } from "react";

/**
 * Props for the WebSocketPipecatAppBase component.
 */
export interface WebSocketPipecatBaseProps {
  /** API endpoint to get WebSocket URL from */
  connectEndpoint: string;
  /** Optional configuration options for the Pipecat client */
  clientOptions?: Partial<Omit<PipecatClientOptions, "transport">>;
  /** Whether to automatically connect to the session when the component mounts */
  connectOnMount?: boolean;
  /** Whether to automatically initialize devices when the component mounts */
  initDevicesOnMount?: boolean;
  /** Disables audio output for the bot */
  noAudioOutput?: boolean;
  /** Callbacks for PipecatClient events (for console logging etc) */
  callbacks?: PipecatClientOptions["callbacks"];
  /**
   * Children can be either:
   * - A render prop function that receives helper props and returns React nodes
   * - Direct React nodes that will be wrapped with the necessary providers
   */
  children:
    | ((props: WebSocketPipecatBaseChildProps) => React.ReactNode)
    | React.ReactNode;
}

/**
 * Props that are passed to child components.
 */
export interface WebSocketPipecatBaseChildProps {
  /** Pipecat client instance */
  client: PipecatClient | null;
  /** Function to initiate a connection to the session */
  handleConnect?: () => Promise<void>;
  /** Function to disconnect from the current session */
  handleDisconnect?: () => Promise<void>;
  /** Error message if connection fails */
  error?: string | null;
  /** Whether we're currently connecting */
  isConnecting?: boolean;
}

/**
 * WebSocketPipecatAppBase component that provides a configured PipecatClient with WebSocket transport.
 *
 * IMPORTANT: This component creates a fresh PipecatClient and WebSocketTransport for each new
 * connection. This is necessary because WebSocketTransport doesn't properly reset its internal
 * audio state after disconnection, causing audio playback to fail on subsequent connections.
 */
export const WebSocketPipecatAppBase: React.FC<WebSocketPipecatBaseProps> = ({
  connectEndpoint,
  clientOptions,
  connectOnMount = false,
  initDevicesOnMount = false,
  noAudioOutput = false,
  callbacks,
  children,
}) => {
  const [client, setClient] = useState<PipecatClient | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  // Use ref to track current client for cleanup on unmount
  const clientRef = useRef<PipecatClient | null>(null);

  /**
   * Creates a fresh PipecatClient with a new WebSocketTransport instance.
   * This ensures audio works correctly for each new session.
   */
  const createFreshClient = useCallback(() => {
    const transport = new WebSocketTransport();

    const pcClient = new PipecatClient({
      enableCam: false,
      enableMic: true,
      transport: transport,
      ...clientOptions,
      callbacks: {
        ...callbacks,
        // Merge error callback
        onError: (message: RTVIMessage) => {
          console.error("[WebSocketPipecatAppBase] Error:", message);
          setError(String(message));
          callbacks?.onError?.(message);
        },
      },
    });

    return pcClient;
  }, [clientOptions, callbacks]);

  /**
   * Connect handler - creates a fresh client and connects.
   * Creating a new client for each connection ensures audio works properly.
   */
  const handleConnect = useCallback(async () => {
    // Don't connect if already connecting
    if (isConnecting) return;

    try {
      setIsConnecting(true);
      setError(null);

      // Disconnect and cleanup any existing client first
      if (clientRef.current) {
        const state = clientRef.current.state;
        if (state === "ready" || state === "connecting") {
          try {
            await clientRef.current.disconnect();
          } catch (e) {
            console.warn(
              "[WebSocketPipecatAppBase] Error disconnecting old client:",
              e,
            );
          }
        }
        clientRef.current = null;
        setClient(null);
      }

      // Create a fresh client for this connection
      const newClient = createFreshClient();
      clientRef.current = newClient;
      setClient(newClient);

      // Initialize devices if requested
      if (initDevicesOnMount) {
        await newClient.initDevices();
      }

      // Connect using startBotAndConnect which handles the API call
      await newClient.startBotAndConnect({
        endpoint: connectEndpoint,
      });
    } catch (err) {
      console.error("[WebSocketPipecatAppBase] Connection error:", err);
      setError(
        `Failed to connect: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      // Clean up failed client
      clientRef.current = null;
      setClient(null);
    } finally {
      setIsConnecting(false);
    }
  }, [connectEndpoint, createFreshClient, initDevicesOnMount, isConnecting]);

  /**
   * Disconnect handler - disconnects and clears client.
   */
  const handleDisconnect = useCallback(async () => {
    if (!clientRef.current) return;

    const state = clientRef.current.state;
    if (state === "ready" || state === "connecting") {
      try {
        await clientRef.current.disconnect();
      } catch (e) {
        console.warn("[WebSocketPipecatAppBase] Error during disconnect:", e);
      }
    }

    // Clear the client after disconnect so next connect creates fresh one
    clientRef.current = null;
    setClient(null);
  }, []);

  /**
   * Auto-connect on mount if requested
   */
  useEffect(() => {
    if (connectOnMount) {
      handleConnect();
    }
  }, [connectOnMount]); // Intentionally not including handleConnect to avoid re-running

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (clientRef.current) {
        const state = clientRef.current.state;
        if (state === "ready" || state === "connecting") {
          clientRef.current.disconnect().catch(console.error);
        }
        clientRef.current = null;
      }
    };
  }, []);

  const passedProps: WebSocketPipecatBaseChildProps = {
    client,
    handleConnect,
    handleDisconnect,
    error,
    isConnecting,
  };

  // When no client exists, render children without the provider
  // This allows the UI to show connect button etc.
  if (!client) {
    return typeof children === "function"
      ? (children(passedProps) as React.ReactElement)
      : (children as React.ReactElement);
  }

  return (
    <PipecatClientProvider client={client}>
      {typeof children === "function" ? children(passedProps) : children}
      {!noAudioOutput && <PipecatClientAudio />}
    </PipecatClientProvider>
  );
};
