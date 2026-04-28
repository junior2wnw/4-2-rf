import { createEnvelope, MessageEnvelope } from "../core/envelope.js";

export function textMessage(text: string): MessageEnvelope<string> {
  return createEnvelope({
    channel: "messages",
    type: "text",
    contentType: "text/plain; charset=utf-8",
    encoding: "utf8",
    payload: text,
    delivery: { mode: "reliable", ack: true }
  });
}

export function jsonMessage<T>(type: string, payload: T): MessageEnvelope<T> {
  return createEnvelope({
    channel: "messages",
    type,
    contentType: "application/json",
    encoding: "json",
    payload,
    delivery: { mode: "reliable", ack: true }
  });
}
