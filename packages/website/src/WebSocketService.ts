import { logger } from './utils/Logger';

// Command types supported by casa-main
type Command = "Arm Stay" | "Arm Away" | "Disarm" | "GetSystemState";

// WebSocket service interface
interface WebSocketEvent {
  type: string;
  data?: any;
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private readonly url: string;
  private eventTarget: EventTarget = new EventTarget();
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 20;
  private reconnectDelay: number = 1000;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private online: boolean = false;
  private homeId: string = "720frontrd";
  private connecting: boolean = false;
  private lastCommandSent: number = 0;
  private commandMinInterval: number = 1500;
  private lastMessageReceived: number = 0;
  private connectionHealthCheckInterval: NodeJS.Timeout | null = null;
  private maxMessageAge: number = 300000; // Increased from 3 minutes to 5 minutes for even better tolerance
  private serverErrorCount: number = 0;
  private lastServerError: number = 0;
  private serverErrorBackoffTime: number = 5000;
  private maxServerErrorBackoffTime: number = 60000;
  private systemStateRequestInProgress: boolean = false;
  private lastSystemStateRequest: number = 0;
  private systemStateRequestInterval: number = 30000;
  private stateData: any = null;
  private stateDataMaxAge: number = 60000;
  private pendingStaterequestTimer: NodeJS.Timeout | null = null;
  private permanentlyFailed: boolean = false;

  // Track pending commands for acknowledgment
  private pendingCommands: Map<
    string,
    {
      command: string;
      timestamp: number;
      retry?: number;
    }
  > = new Map();

  // Command timeout in ms (45 seconds instead of 30)
  private commandTimeout = 45000;

  // Command queue for when connection is down
  private commandQueue: Array<{
    command: Command;
    commandId: string;
    homeId: string;
    timestamp: string;
  }> = [];

  constructor(url: string, homeId?: string) {
    this.url = url;
    if (homeId) this.homeId = homeId;

    // Start with a short delay to prevent immediate connection on page load
    setTimeout(() => {
      this.connect();
      this.startConnectionHealthCheck();
    }, 1000);
  }

  // Connect to WebSocket server with connection lock
  public connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN || this.connecting || this.permanentlyFailed) return;

    try {
      this.connecting = true;
      logger.info("Connecting to WebSocket...");
      this.socket = new WebSocket(this.url);

      this.socket.onopen = () => {
        this.connecting = false;
        this.handleOpen();
      };
      this.socket.onmessage = (event) => this.handleMessage(event);
      this.socket.onerror = (event) => this.handleError(event);
      this.socket.onclose = (event) => {
        this.connecting = false;
        this.handleClose(event);
      };
    } catch (error) {
      logger.error("Failed to connect to WebSocket server:", error);
      this.connecting = false;
      
      const baseDelay = this.serverErrorCount > 2 ? 5000 : this.reconnectDelay;
      const delay = Math.min(60000, baseDelay * Math.pow(1.5, this.reconnectAttempts));
      this.reconnectTimeout = setTimeout(() => {
        this.reconnectAttempts++;
        this.connect();
      }, delay);
    }
  }

  // Disconnect from WebSocket server (only call when explicitly needed)
  public disconnect(): void {
    this.stopConnectionHealthCheck();

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.pendingStaterequestTimer) {
      clearTimeout(this.pendingStaterequestTimer);
      this.pendingStaterequestTimer = null;
    }

    if (this.socket) {
      logger.info("Closing WebSocket on cleanup");
      try {
        if (
          this.socket.readyState === WebSocket.OPEN ||
          this.socket.readyState === WebSocket.CONNECTING
        ) {
          this.socket.close(1000, "Clean disconnect");
        }
      } catch (e) {
        logger.error("Error closing socket:", e);
      }
      this.socket = null;
    }

    // Note: Queued commands remain in the queue to be sent on reconnect
    if (this.commandQueue.length > 0) {
      logger.info(`Disconnecting with ${this.commandQueue.length} commands still queued`);
    }
  }

  // Send a command with queueing if connection is unavailable
  public sendCommand(command: Command): string {
    const now = Date.now();
    const isControlCommand = command === "Arm Stay" || command === "Arm Away" || command === "Disarm";
    const commandId = Math.floor(Math.random() * 1000000000).toString();
    const commandData = {
      command,
      commandId,
      homeId: this.homeId,
      timestamp: new Date().toISOString(),
    };

    // Handle GetSystemState separately with throttling
    if (command === "GetSystemState") {
      if (now - this.lastSystemStateRequest < this.systemStateRequestInterval) {
        logger.debug(
          `Rate limiting GetSystemState: last request ${(now - this.lastSystemStateRequest) / 1000}s ago`
        );
        if (this.stateData) {
          this.eventTarget.dispatchEvent(
            new CustomEvent("event", { detail: { type: "system_state", data: this.stateData } })
          );
          return commandId;
        }
        return "";
      }
      if (this.systemStateRequestInProgress) {
        logger.debug("GetSystemState request already in progress");
        return "";
      }
      this.systemStateRequestInProgress = true;
      this.lastSystemStateRequest = now;
    } else if (now - this.lastCommandSent < (isControlCommand ? 1000 : this.commandMinInterval)) {
      // Increased control command minimum interval to 1 second
      logger.debug(`Rate limiting command: ${command}`);
      setTimeout(() => this.sendCommand(command), isControlCommand ? 1000 : this.commandMinInterval);
      return commandId;
    }

    // Send command if socket is open
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        if (isControlCommand) {
          logger.info(
            `SENDING CONTROL COMMAND: ${command} with ID: ${commandId}`
          );
        } else {
          logger.debug(`Sent command: ${command} with ID: ${commandId}`);
        }
        this.socket.send(JSON.stringify(commandData));
        this.lastCommandSent = now;
        this.pendingCommands.set(commandId, { command, timestamp: now });

        // Dispatch command_sent event immediately to update UI
        this.eventTarget.dispatchEvent(
          new CustomEvent("event", {
            detail: { 
              type: "command_sent", 
              data: { command, commandId, timestamp: now }
            }
          })
        );

        // Set timeout for command acknowledgment
        setTimeout(() => {
          if (this.pendingCommands.has(commandId)) {
            this.pendingCommands.delete(commandId);
            if (command === "GetSystemState") this.systemStateRequestInProgress = false;
            this.eventTarget.dispatchEvent(
              new CustomEvent("event", {
                detail: { 
                  type: "command_timeout", 
                  data: { command, commandId, timestamp: now } 
                },
              })
            );
          }
        }, this.commandTimeout);

        return commandId;
      } catch (error) {
        logger.error("Error sending command:", error);
        // Fall through to queueing
      }
    }

    // Queue command if socket is not available
    logger.info(`Queueing command: ${command} with ID: ${commandId}`);
    this.commandQueue.push(commandData);
    this.eventTarget.dispatchEvent(
      new CustomEvent("event", { detail: { type: "command_queued", data: commandData } })
    );
    if (!this.connecting && (!this.socket || this.socket.readyState === WebSocket.CLOSED)) {
      this.connect();
    }
    return commandId;
  }

  // Handle WebSocket open event and send queued commands
  private handleOpen(): void {
    logger.info("WebSocket connection established");
    this.online = true;
    this.reconnectAttempts = 0;
    this.lastMessageReceived = Date.now();
    this.serverErrorCount = 0;
    this.permanentlyFailed = false;

    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = setInterval(() => this.sendPing(), 60000); // Increased from 45s to 60s

    // Send queued commands
    while (this.commandQueue.length > 0) {
      const commandData = this.commandQueue.shift();
      if (commandData && this.socket && this.socket.readyState === WebSocket.OPEN) {
        try {
          const isControlCommand =
            commandData.command === "Arm Stay" ||
            commandData.command === "Arm Away" ||
            commandData.command === "Disarm";
          if (isControlCommand) {
            logger.info(
              `SENDING QUEUED CONTROL COMMAND: ${commandData.command} with ID: ${commandData.commandId}`
            );
          } else {
            logger.debug(`Sent queued command: ${commandData.command} with ID: ${commandData.commandId}`);
          }
          this.socket.send(JSON.stringify(commandData));
          this.lastCommandSent = Date.now();
          this.pendingCommands.set(commandData.commandId, {
            command: commandData.command,
            timestamp: Date.now(),
          });

          // Dispatch command_sent event for queued commands too
          this.eventTarget.dispatchEvent(
            new CustomEvent("event", {
              detail: { 
                type: "command_sent", 
                data: { 
                  command: commandData.command, 
                  commandId: commandData.commandId,
                  timestamp: commandData.timestamp
                }
              }
            })
          );

          setTimeout(() => {
            if (this.pendingCommands.has(commandData.commandId)) {
              this.pendingCommands.delete(commandData.commandId);
              if (commandData.command === "GetSystemState") this.systemStateRequestInProgress = false;
              this.eventTarget.dispatchEvent(
                new CustomEvent("event", {
                  detail: {
                    type: "command_timeout",
                    data: {
                      command: commandData.command,
                      commandId: commandData.commandId,
                      timestamp: commandData.timestamp,
                    },
                  },
                })
              );
            }
          }, this.commandTimeout);
        } catch (error) {
          logger.error("Error sending queued command:", error);
          this.commandQueue.unshift(commandData); // Requeue on failure
        }
      }
    }

    setTimeout(() => this.sendCommand("GetSystemState"), 1000);
    this.eventTarget.dispatchEvent(new CustomEvent("event", { detail: { type: "connected" } }));
  }

  // Send a ping to keep connection alive
  private sendPing(): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      const pingMessage = { 
        event: "ping", 
        timestamp: new Date().toISOString(), 
        clientId: "web-ui",
        systemState: this.stateData?.state || null  // Include current state for better diagnostics
      };
      this.socket.send(JSON.stringify(pingMessage));
    } catch (error) {
      logger.error("Error sending ping:", error);
      this.handleConnectionProblem();
    }
  }

  // Handle WebSocket message event
  private handleMessage(event: MessageEvent): void {
    try {
      this.lastMessageReceived = Date.now();
      const data = JSON.parse(event.data);

      if (data.message && data.message === "Internal server error") {
        this.handleServerError(data);
        return;
      }

      // Command sent confirmation
      if (data.type === "command_sent") {
        const commandId = data.commandId;
        const pendingCommand = this.pendingCommands.get(commandId);
        if (pendingCommand) {
          this.eventTarget.dispatchEvent(
            new CustomEvent("event", {
              detail: { 
                type: "command_sent",
                data: { 
                  ...data,
                  command: pendingCommand.command 
                }
              }
            })
          );
        }
        return;
      }

      if (data.event === "pong" || data.event === "ping") {
        this.eventTarget.dispatchEvent(new CustomEvent("event", { detail: { type: "pong" } }));
        return;
      }

      // Handle command acknowledgments with improved detection
      if (data.type === "command_ack" || (data.id && data.type === "command_ack")) {
        const commandId = data.commandId;
        if (this.pendingCommands.has(commandId)) {
          const pendingCommand = this.pendingCommands.get(commandId);
          
          // Update state data immediately on acknowledgment
          if (data.state) {
            this.stateData = { 
              state: data.state, 
              timestamp: data.timestamp || new Date().toISOString() 
            };
            logger.debug(`State updated from command_ack: ${data.state}`);
          }

          if (pendingCommand?.command === "GetSystemState") {
            this.systemStateRequestInProgress = false;
            if (this.pendingStaterequestTimer) {
              clearTimeout(this.pendingStaterequestTimer);
              this.pendingStaterequestTimer = null;
            }
          }

          // Clear the pending command
          this.pendingCommands.delete(commandId);
          
          // Dispatch acknowledgment event with full context
          this.eventTarget.dispatchEvent(
            new CustomEvent("event", {
              detail: {
                type: "command_ack",
                data: {
                  ...data,
                  command: pendingCommand?.command,
                  success: data.success !== false // Default to true if not explicitly false
                }
              }
            })
          );

          // Log successful acknowledgment
          logger.debug(`Command ${pendingCommand?.command} (ID: ${commandId}) acknowledged successfully`);
        }
        return;
      }

      // Handle system state updates
      if (data.type === "system_state") {
        this.stateData = data;
        logger.debug(`Received system_state update: ${data.state || 'unknown'}`);
        this.eventTarget.dispatchEvent(
          new CustomEvent("event", { detail: { type: "system_state", data } })
        );
        return;
      }

      if (data.event && data.id && data.timestamp) {
        this.eventTarget.dispatchEvent(
          new CustomEvent("event", { detail: { type: "event", data } })
        );
        return;
      }

      this.eventTarget.dispatchEvent(
        new CustomEvent("event", { detail: { type: "message", data } })
      );
    } catch (error) {
      logger.error("Error handling WebSocket message:", error);
    }
  }

  // Handle server errors
  private handleServerError(data: any): void {
    this.serverErrorCount++;
    this.lastServerError = Date.now();
    if (this.serverErrorCount > 1) {
      this.serverErrorBackoffTime = Math.min(
        this.maxServerErrorBackoffTime,
        this.serverErrorBackoffTime * 1.5
      );
    }
    logger.warn(`Server error (${this.serverErrorCount}), backoff: ${this.serverErrorBackoffTime}ms`);
    if (this.serverErrorCount > 5 && this.socket) {
      logger.error("Too many server errors, forcing reconnection");
      this.handleConnectionProblem();
    }
    for (const [commandId, command] of this.pendingCommands.entries()) {
      if (command.command === "GetSystemState") {
        this.pendingCommands.delete(commandId);
        this.systemStateRequestInProgress = false;
      }
    }
    if (this.pendingStaterequestTimer) {
      clearTimeout(this.pendingStaterequestTimer);
      this.pendingStaterequestTimer = null;
    }
  }

  // Handle WebSocket error event
  private handleError(event: Event): void {
    logger.error("WebSocket error:", event);
    this.online = false;
    this.eventTarget.dispatchEvent(
      new CustomEvent("event", { detail: { type: "error", data: event } })
    );
    this.handleConnectionProblem();
  }

  // Handle WebSocket close event
  private handleClose(event: CloseEvent): void {
    this.online = false;
    this.eventTarget.dispatchEvent(
      new CustomEvent("event", { detail: { type: "disconnected" } })
    );

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error("Maximum reconnection attempts reached");
      this.permanentlyFailed = true;
      this.eventTarget.dispatchEvent(
        new CustomEvent("event", { detail: { type: "connection_failed_permanently" } })
      );
      return;
    }

    const baseDelay = this.serverErrorCount > 2 ? 5000 : this.reconnectDelay;
    const delay = Math.min(60000, baseDelay * Math.pow(1.5, this.reconnectAttempts));
    logger.info(
      `Scheduling reconnection attempt in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
    );
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  // Start connection health check - runs less frequently for better tolerance
  private startConnectionHealthCheck(): void {
    this.stopConnectionHealthCheck();
    this.connectionHealthCheckInterval = setInterval(() => {
      const now = Date.now();
      if (this.online && now - this.lastMessageReceived > this.maxMessageAge) {
        logger.warn(
          `Connection may be stale, last message received ${(now - this.lastMessageReceived) / 1000}s ago`
        );
        this.handleConnectionProblem();
      }
      if (
        !this.socket &&
        !this.connecting &&
        this.reconnectAttempts < this.maxReconnectAttempts &&
        !this.permanentlyFailed
      ) {
        this.connect();
      }
      if (this.serverErrorBackoffTime > 5000 && now - this.lastServerError > 30000) {
        this.serverErrorBackoffTime = Math.max(5000, this.serverErrorBackoffTime / 2);
        this.serverErrorCount = Math.max(0, this.serverErrorCount - 1);
      }
      if (
        this.systemStateRequestInProgress &&
        now - this.lastSystemStateRequest > this.commandTimeout
      ) {
        logger.debug("Clearing stuck GetSystemState request flag due to timeout");
        this.systemStateRequestInProgress = false;
        if (this.pendingStaterequestTimer) {
          clearTimeout(this.pendingStaterequestTimer);
          this.pendingStaterequestTimer = null;
        }
        this.eventTarget.dispatchEvent(
          new CustomEvent("event", {
            detail: { type: "system_state_timeout", data: { timestamp: this.lastSystemStateRequest } },
          })
        );
      }
    }, 60000); // Increased from 30s to 60s to check even less frequently
  }

  // Stop connection health check
  private stopConnectionHealthCheck(): void {
    if (this.connectionHealthCheckInterval) {
      clearInterval(this.connectionHealthCheckInterval);
      this.connectionHealthCheckInterval = null;
    }
  }

  // Handle connection problems
  private handleConnectionProblem(): void {
    if (!this.socket) return;
    if (
      this.socket.readyState === WebSocket.CLOSING ||
      this.socket.readyState === WebSocket.CLOSED
    ) {
      this.socket = null;
      this.systemStateRequestInProgress = false;
      if (this.pendingStaterequestTimer) {
        clearTimeout(this.pendingStaterequestTimer);
        this.pendingStaterequestTimer = null;
      }
      return;
    }
    try {
      this.online = false;
      logger.info("Closing existing WebSocket connection");
      this.socket.close();
    } catch (e) {
      logger.error("Error closing problematic socket connection:", e);
    } finally {
      this.socket = null;
      this.systemStateRequestInProgress = false;
      if (this.pendingStaterequestTimer) {
        clearTimeout(this.pendingStaterequestTimer);
        this.pendingStaterequestTimer = null;
      }
    }
  }

  // Get system state
  public getSystemState(): any {
    if (this.stateData) {
      const now = Date.now();
      const stateTime = this.stateData.timestamp ? new Date(this.stateData.timestamp).getTime() : 0;
      if (now - stateTime < this.stateDataMaxAge) {
        return this.stateData;
      } else {
        this.eventTarget.dispatchEvent(
          new CustomEvent("event", { detail: { type: "stale_system_state", data: this.stateData } })
        );
      }
    }
    this.sendCommand("GetSystemState");
    return null;
  }

  // Get current alarm mode directly from stored state
  public getCurrentMode(): string | null {
    if (this.stateData && this.stateData.state) {
      return this.stateData.state;
    }
    return null;
  }

  // Event listeners
  public on(eventName: string, listener: (event: CustomEvent<WebSocketEvent>) => void): void {
    this.eventTarget.addEventListener(eventName, listener as EventListener);
  }

  public off(eventName: string, listener: (event: CustomEvent<WebSocketEvent>) => void): void {
    this.eventTarget.removeEventListener(eventName, listener as EventListener);
  }

  public isOnline(): boolean {
    return this.online;
  }

  // Reset reconnection state (e.g., from UI action)
  public resetReconnection(): void {
    this.reconnectAttempts = 0;
    this.permanentlyFailed = false;
    this.serverErrorCount = 0;
    this.serverErrorBackoffTime = 5000;
    this.connect();
  }
}

export const wsService = new WebSocketService(
  "wss://w42qpgs203.execute-api.us-east-1.amazonaws.com/prod",
  "720frontrd"
);

export default WebSocketService;
