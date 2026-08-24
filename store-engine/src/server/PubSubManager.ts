import type { ClientConnection } from './TcpServer.js';
import { reply } from '@ministore/protocol';

export class PubSubManager {
  // channel name -> set of subscribed connections
  readonly #channels = new Map<string, Set<ClientConnection>>();
  // connection -> set of channels it is subscribed to
  readonly #connections = new Map<ClientConnection, Set<string>>();

  /**
   * Subscribes a connection to the given channels.
   * Returns an array of formatted subscription replies to be sent back.
   */
  subscribe(connection: ClientConnection, channels: readonly string[]): string[] {
    const replies: string[] = [];
    let connChannels = this.#connections.get(connection);
    if (!connChannels) {
      connChannels = new Set();
      this.#connections.set(connection, connChannels);
    }

    for (const channel of channels) {
      let channelConns = this.#channels.get(channel);
      if (!channelConns) {
        channelConns = new Set();
        this.#channels.set(channel, channelConns);
      }
      channelConns.add(connection);
      connChannels.add(channel);
      replies.push(reply.subscribe(channel, connChannels.size));
    }
    return replies;
  }

  /**
   * Unsubscribes a connection from the given channels.
   * If no channels are provided, unsubscribes from all channels.
   * Returns an array of formatted unsubscription replies.
   */
  unsubscribe(connection: ClientConnection, channels?: readonly string[]): string[] {
    const connChannels = this.#connections.get(connection);
    if (!connChannels) {
      // Not subscribed to anything, but we still send back confirmations if channels were specified
      if (channels && channels.length > 0) {
        return channels.map(ch => reply.unsubscribe(ch, 0));
      }
      return [];
    }

    const channelsToRemove = channels && channels.length > 0 ? channels : Array.from(connChannels);
    const replies: string[] = [];

    for (const channel of channelsToRemove) {
      connChannels.delete(channel);
      const channelConns = this.#channels.get(channel);
      if (channelConns) {
        channelConns.delete(connection);
        if (channelConns.size === 0) {
          this.#channels.delete(channel);
        }
      }
      replies.push(reply.unsubscribe(channel, connChannels.size));
    }

    if (connChannels.size === 0) {
      this.#connections.delete(connection);
    }

    return replies;
  }

  /**
   * Publishes a message to a channel.
   * Pushes the message to all subscribed connections directly.
   * Returns the number of connections that received the message.
   */
  publish(channel: string, message: string): number {
    const channelConns = this.#channels.get(channel);
    if (!channelConns || channelConns.size === 0) {
      return 0;
    }

    const formattedMessage = reply.pushMessage(channel, message);
    for (const conn of channelConns) {
      conn.write(formattedMessage);
    }

    return channelConns.size;
  }

  /**
   * Cleans up all subscriptions for a connection when it disconnects.
   */
  removeConnection(connection: ClientConnection): void {
    const connChannels = this.#connections.get(connection);
    if (connChannels) {
      for (const channel of connChannels) {
        const channelConns = this.#channels.get(channel);
        if (channelConns) {
          channelConns.delete(connection);
          if (channelConns.size === 0) {
            this.#channels.delete(channel);
          }
        }
      }
      this.#connections.delete(connection);
    }
  }

  /**
   * Returns true if the connection is currently subscribed to any channels.
   */
  isSubscribed(connection: ClientConnection): boolean {
    const connChannels = this.#connections.get(connection);
    return connChannels !== undefined && connChannels.size > 0;
  }
}
