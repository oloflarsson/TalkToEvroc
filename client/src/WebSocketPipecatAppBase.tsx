/**
 * WebSocketPipecatAppBase - Custom wrapper for WebSocket transport
 *
 * Simplified version without external theme dependencies.
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
import React, { useCallback, useEffect, useState } from "react";

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

  /**
   * Connect to the bot session by fetching ws_url from the connectEndpoint
   */
  const doConnect = useCallback(
    async (pcClient: PipecatClient) => {
      try {
        setIsConnecting(true);
        setError(null);

        // Use startBotAndConnect which handles the API call and connection
        await pcClient.startBotAndConnect({
          endpoint: connectEndpoint,
        });
      } catch (err) {
        console.error("[WebSocketPipecatAppBase] Connection error:", err);
        setError(
          `Failed to connect: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      } finally {
        setIsConnecting(false);
      }
    },
    [connectEndpoint],
  );

  /**
   * Initialize the Pipecat client with WebSocket transport
   */
  useEffect(() => {
    let currentClient: PipecatClient | null = null;

    (async () => {
      try {
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

        currentClient = pcClient;
        setClient(pcClient);

        if (initDevicesOnMount) {
          await pcClient.initDevices();
        }

        if (connectOnMount) {
          await doConnect(pcClient);
        }
      } catch (err) {
        console.error("[WebSocketPipecatAppBase] Failed to initialize:", err);
        setError(
          `Failed to initialize: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    })();

    return () => {
      if (currentClient) {
        // Only disconnect if we're in a connected state, otherwise we get
        // "Session ended: please call .begin() first" error
        const state = currentClient.state;
        if (state === "ready" || state === "connecting") {
          currentClient.disconnect().catch(console.error);
        }
      }
      setClient(null);
      setError(null);
    };
  }, [
    connectEndpoint,
    clientOptions,
    callbacks,
    connectOnMount,
    initDevicesOnMount,
    doConnect,
  ]);

  /**
   * Connect handler for external use
   */
  const handleConnect = async () => {
    if (
      !client ||
      !["initialized", "disconnected", "error"].includes(client.state)
    ) {
      return;
    }
    await doConnect(client);
  };

  /**
   * Disconnect handler
   */
  const handleDisconnect = async () => {
    if (!client) return;
    // Only disconnect if we're in a connected state
    const state = client.state;
    if (state === "ready" || state === "connecting") {
      await client.disconnect();
    }
  };

  // Show children even while client is initializing (for loading states)
  if (!client) {
    return typeof children === "function"
      ? (children({ client: null, error, isConnecting }) as React.ReactElement)
      : (children as React.ReactElement);
  }

  const passedProps: WebSocketPipecatBaseChildProps = {
    client,
    handleConnect,
    handleDisconnect,
    error,
    isConnecting,
  };

  return (
    <PipecatClientProvider client={client}>
      {typeof children === "function" ? children(passedProps) : children}
      {!noAudioOutput && <PipecatClientAudio />}
    </PipecatClientProvider>
  );
};
