import { MessageEnvelope } from "../core/envelope.js";
import { ChannelAdapter, ChannelContext } from "../streams/channel.js";
import { textMessage } from "./messages.js";

export interface TextMessageInput {
  readonly text: string;
}

export class MessageChannelAdapter implements ChannelAdapter<TextMessageInput, string> {
  readonly channel = "messages";
  readonly capabilities = ["messages.send"];

  createEnvelope(input: TextMessageInput, context: ChannelContext): MessageEnvelope<string> {
    context.requirePermission({ channel: this.channel, action: "send" });
    return textMessage(input.text);
  }
}
