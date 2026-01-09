import type { archestraApiTypes } from "@shared";
import type { PartialUIMessage } from "@/components/chatbot-demo";
import type { DualLlmResult, Interaction, InteractionUtils } from "./common";

class PerplexityChatCompletionInteraction implements InteractionUtils {
  private request: archestraApiTypes.PerplexityChatCompletionRequest;
  private response: archestraApiTypes.PerplexityChatCompletionResponse;
  modelName: string;

  constructor(interaction: Interaction) {
    this.request =
      interaction.request as archestraApiTypes.PerplexityChatCompletionRequest;
    this.response =
      interaction.response as archestraApiTypes.PerplexityChatCompletionResponse;
    this.modelName = interaction.model ?? this.request.model;
  }

  //Perplexity doesn't support tool calls, so we return false
  isLastMessageToolCall(): boolean {
    return false;
  }

  //Perplexity doesn't support tool calls, so we return null
  getLastToolCallId(): string | null {
    return null;
  }

  //Perplexity doesn't support tool calls, so we return an empty array
  getToolNamesUsed(): string[] {
    return [];
  }

  //Perplexity doesn't support tool calls, so we return an empty array
  getToolNamesRefused(): string[] {
    return [];
  }

  getToolNamesRequested(): string[] {
    //Perplexity doesn't support tool calls, so we return an empty array
    return [];
  }

  getLastUserMessage(): string {
    const reversedMessages = [...this.request.messages].reverse();
    for (const message of reversedMessages) {
      if (message.role !== "user") {
        continue;
      }
      return message.content;
    }
    return "";
  }

  getLastAssistantResponse(): string {
    const content = this.response.choices[0]?.message?.content;
    return content ?? "";
  }

  getToolRefusedCount(): number {
    return 0;
  }

  private mapToUiMessage(
    message:
      | archestraApiTypes.PerplexityChatCompletionRequest["messages"][number]
      | archestraApiTypes.PerplexityChatCompletionResponse["choices"][number]["message"],
  ): PartialUIMessage {
    const parts: PartialUIMessage["parts"] = [];
    const { content, role } = message;

    parts.push({ type: "text", text: content });

    return {
      role: role as PartialUIMessage["role"],
      parts,
    };
  }

  private mapRequestToUiMessages(
    dualLlmResults?: DualLlmResult[],
  ): PartialUIMessage[] {
    const messages = this.request.messages;
    const uiMessages: PartialUIMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const uiMessage = this.mapToUiMessage(msg);
      uiMessages.push(uiMessage);

    }

    return uiMessages;
  }

  private mapResponseToUiMessages(): PartialUIMessage[] {
    return this.response.choices.map((choice) =>
      this.mapToUiMessage(choice.message),
    );
  }

  mapToUiMessages(dualLlmResults?: DualLlmResult[]): PartialUIMessage[] {
    return [
      ...this.mapRequestToUiMessages(dualLlmResults),
      ...this.mapResponseToUiMessages(),
    ];
  }
}

export default PerplexityChatCompletionInteraction;
