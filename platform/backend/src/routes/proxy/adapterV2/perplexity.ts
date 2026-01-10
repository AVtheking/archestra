import { get } from 'lodash-es';
import PerplexityProvider from '@perplexity-ai/perplexity_ai';
import config from '@/config';
import { getObservableFetch } from '@/llm-metrics';
import logger from '@/logging';
import { getTokenizer } from '@/tokenizers';
import type {
  ChunkProcessingResult,
  CommonMcpToolDefinition,
  CommonMessage,
  CommonToolCall,
  CommonToolResult,
  CreateClientOptions,
  LLMProvider,
  LLMRequestAdapter,
  LLMResponseAdapter,
  LLMStreamAdapter,
  StreamAccumulatorState,
  ToonCompressionResult,
  UsageView,
  Perplexity,
} from '@/types';
import { MockOpenAIClient } from '../mock-openai-client';

import { PerplexityModel } from '@/types/llm-providers/perplexity/api';

// =============================================================================
// TYPE ALIASES
// =============================================================================

type PerplexityRequest = Perplexity.Types.ChatCompletionsRequest;
type PerplexityResponse = Perplexity.Types.ChatCompletionsResponse;
type PerplexityMessages = Perplexity.Types.ChatCompletionsRequest['messages'];
type PerplexityHeaders = Perplexity.Types.ChatCompletionsHeaders;
type PerplexityStreamChunk = Perplexity.Types.ChatCompletionChunk;

// =============================================================================
// REQUEST ADAPTER
// =============================================================================

class PerplexityRequestAdapter
  implements LLMRequestAdapter<PerplexityRequest, PerplexityMessages> {
  readonly provider = 'perplexity' as const;
  private request: PerplexityRequest;

  constructor(request: PerplexityRequest) {
    this.request = request;
  }

  // ---------------------------------------------------------------------------
  // Read Access
  // ---------------------------------------------------------------------------

  getModel(): PerplexityModel {
    return this.request.model;
  }

  isStreaming(): boolean {
    return this.request.stream === true;
  }

  getMessages(): CommonMessage[] {
    return this.toCommonFormat(this.request.messages);
  }

  //perplexity doens't support tool calling so no tool results
  getToolResults(): CommonToolResult[] {
    return [];
  }

  getTools(): CommonMcpToolDefinition[] {
    return [];
  }

  hasTools(): boolean {
    return false;
  }

  getProviderMessages(): PerplexityMessages {
    return this.request.messages;
  }

  getOriginalRequest(): PerplexityRequest {
    return this.request;
  }

  // ---------------------------------------------------------------------------
  // Modify Access
  // ---------------------------------------------------------------------------

  setModel(model: string): void {
    //
  }

  updateToolResult(toolCallId: string, newContent: string): void {
    //perplexity doens't support tool calling
  }

  applyToolResultUpdates(updates: Record<string, string>): void {
    //perplexity doens't support tool calling
  }

  convertToolResultContent(messages: PerplexityMessages): PerplexityMessages {
    return messages;
  }

  //Not used
  async applyToonCompression(model: string): Promise<ToonCompressionResult> {
    //perplexity doens't support tool calling so no toon compression needed
    const tokenizer = getTokenizer('perplexity');
    const tokenBefore = tokenizer.countTokens(
      this.request.messages.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }))
    );
    const tokenAfter = tokenizer.countTokens(
      this.request.messages.map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }))
    );

    return {
      tokensBefore: tokenBefore,
      tokensAfter: tokenAfter,
      costSavings: tokenBefore - tokenAfter,
    };
  }

  // ---------------------------------------------------------------------------
  // Build Modified Request
  // ---------------------------------------------------------------------------

  toProviderRequest(): PerplexityRequest {
    let messages = this.request.messages;

    return {
      ...this.request,
      model: this.getModel(),
      messages,
    };
  }

  private toCommonFormat(messages: PerplexityMessages): CommonMessage[] {
    logger.debug(
      { messageCount: messages.length },
      '[PerplexityAdapter] toCommonFormat: starting conversion'
    );
    const commonMessages: CommonMessage[] = [];

    for (const message of messages) {
      const commonMessage: CommonMessage = {
        role: message.role as CommonMessage['role'],
      };

      commonMessages.push(commonMessage);
    }

    logger.debug(
      { inputCount: messages.length, outputCount: commonMessages.length },
      '[PerplexityAdapter] toCommonFormat: conversion complete'
    );
    return commonMessages;
  }
}

// =============================================================================
// RESPONSE ADAPTER
// =============================================================================

class PerplexityResponseAdapter
  implements LLMResponseAdapter<PerplexityResponse> {
  readonly provider = 'perplexity' as const;
  private response: PerplexityResponse;

  constructor(response: PerplexityResponse) {
    this.response = response;
  }

  getId(): string {
    return this.response.id;
  }

  getModel(): string {
    return this.response.model;
  }

  getText(): string {
    const choice = this.response.choices[0];
    if (!choice) return '';
    return choice.message.content ?? '';
  }

  getToolCalls(): CommonToolCall[] {
    return [];
  }

  hasToolCalls(): boolean {
    return false;
  }

  getUsage(): UsageView {
    return {
      inputTokens: this.response.usage?.prompt_tokens ?? 0,
      outputTokens: this.response.usage?.completion_tokens ?? 0,
    };
  }

  getOriginalResponse(): PerplexityResponse {
    return this.response;
  }

  toRefusalResponse(
    _refusalMessage: string,
    contentMessage: string
  ): PerplexityResponse {
    return {
      ...this.response,
      choices: [
        {
          ...this.response.choices[0],
          message: {
            role: 'assistant',
            content: contentMessage,
          },
          finish_reason: 'stop',
        },
      ],
    };
  }
}

// =============================================================================
// STREAM ADAPTER
// =============================================================================

class PerplexityStreamAdapter
  implements LLMStreamAdapter<PerplexityStreamChunk, PerplexityResponse> {
  readonly provider = 'perplexity' as const;
  readonly state: StreamAccumulatorState & {
    searchResults: Perplexity.Types.SearchResult[];
    usage:
    | (UsageView & {
      search_context_size: string | null;
      citation_tokens: number | null;
      reasoning_tokens: number | null;
      num_search_queries: number | null;
    })
    | null;
  };

  constructor() {
    this.state = {
      responseId: '',
      model: '',
      text: '',
      toolCalls: [],
      rawToolCallEvents: [],
      usage: null,
      stopReason: null,
      timing: {
        startTime: Date.now(),
        firstChunkTime: null,
      },
      searchResults: [],
    };
  }

  processChunk(chunk: PerplexityStreamChunk): ChunkProcessingResult {
    if (this.state.timing.firstChunkTime === null) {
      this.state.timing.firstChunkTime = Date.now();
    }

    let sseData: string | null = null;
    let isToolCallChunk = false;
    let isFinal = false;

    this.state.responseId = chunk.id;
    this.state.model = chunk.model;

    // Handle usage first - OpenAI sends usage in a final chunk with empty choices[]
    // when stream_options.include_usage is true
    if (chunk.usage) {
      this.state.usage = {
        inputTokens: chunk.usage.prompt_tokens ?? 0,
        outputTokens: chunk.usage.completion_tokens ?? 0,
        search_context_size: chunk.usage.search_context_size ?? null,
        citation_tokens: chunk.usage.citation_tokens ?? null,
        reasoning_tokens: chunk.usage.reasoning_tokens ?? null,
        num_search_queries: chunk.usage.num_search_queries ?? null,
      };
    }

    const choice = chunk.choices[0];
    if (!choice) {
      // If we have usage, this is the final chunk (OpenAI sends usage in a chunk with empty choices)
      return {
        sseData: null,
        isToolCallChunk: false,
        isFinal: this.state.usage !== null,
      };
    }

    const delta = choice.delta;

    // Handle text content
    if (delta.content) {
      this.state.text += delta.content;
      sseData = `data: ${JSON.stringify(chunk)}\n\n`;
    }

    // Collect metadata from final chunks
    if (chunk.search_results) {
      this.state.searchResults = chunk.search_results;
    }

    if (choice.finish_reason) {
      this.state.stopReason = choice.finish_reason;
      isFinal = true;
    }

    return { sseData, isToolCallChunk, isFinal };
  }

  getSSEHeaders(): Record<string, string> {
    return {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    };
  }

  formatTextDeltaSSE(text: string): string {
    const chunk: PerplexityStreamChunk = {
      id: this.state.responseId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.state.model,
      choices: [
        {
          index: 0,
          delta: {
            content: text,
            role: 'assistant',
          },
          message: {
            role: 'assistant',
            content: text,
          },
          finish_reason: null,
        },
      ],
    };
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }

  getRawToolCallEvents(): string[] {
    return this.state.rawToolCallEvents.map(
      (event) => `data: ${JSON.stringify(event)}\n\n`
    );
  }

  formatCompleteTextSSE(text: string): string[] {
    const chunk: PerplexityStreamChunk = {
      id: this.state.responseId || `chatcmpl-${Date.now()}`,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.state.model,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: text,
          },
          message: {
            role: 'assistant',
            content: text,
          },
          finish_reason: null,
        },
      ],
    };
    return [`data: ${JSON.stringify(chunk)}\n\n`];
  }

  formatEndSSE(): string {
    const finalChunk: PerplexityStreamChunk = {
      id: this.state.responseId,
      object: 'chat.completion.chunk',
      created: Math.floor(Date.now() / 1000),
      model: this.state.model,
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            content: '',
          },
          message: {
            role: 'assistant',
            content: '',
          },
          finish_reason: (this.state.stopReason as 'stop' | 'length') ?? 'stop',
        },
      ],
    };
    return `data: ${JSON.stringify(finalChunk)}\n\ndata: [DONE]\n\n`;
  }

  toProviderResponse(): PerplexityResponse {
    return {
      id: this.state.responseId,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: this.state.model,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: this.state.text || '',
          },
          finish_reason:
            (this.state.stopReason as Perplexity.Types.FinishReason) ?? 'stop',
        },
      ],
      usage: {
        prompt_tokens: this.state.usage?.inputTokens ?? 0,
        completion_tokens: this.state.usage?.outputTokens ?? 0,
        total_tokens:
          (this.state.usage?.inputTokens ?? 0) +
          (this.state.usage?.outputTokens ?? 0),
        search_context_size: this.state.usage?.search_context_size ?? null,
        citation_tokens: this.state.usage?.citation_tokens ?? null,
        reasoning_tokens: this.state.usage?.reasoning_tokens ?? null,
        num_search_queries: this.state.usage?.num_search_queries ?? null,
      },
    };
  }
}

// =============================================================================
// ADAPTER FACTORY
// =============================================================================

export const perplexityAdapterFactory: LLMProvider<
  PerplexityRequest,
  PerplexityResponse,
  PerplexityMessages,
  PerplexityStreamChunk,
  PerplexityHeaders
> = {
  provider: "perplexity",
  interactionType: "perplexity:chatCompletions",

  createRequestAdapter(
    request: PerplexityRequest
  ): LLMRequestAdapter<PerplexityRequest, PerplexityMessages> {
    return new PerplexityRequestAdapter(request);
  },

  createResponseAdapter(
    response: PerplexityResponse
  ): LLMResponseAdapter<PerplexityResponse> {
    return new PerplexityResponseAdapter(response);
  },

  createStreamAdapter(): LLMStreamAdapter<
    PerplexityStreamChunk,
    PerplexityResponse
  > {
    return new PerplexityStreamAdapter();
  },

  //TODO: comeback here
  extractApiKey(headers: PerplexityHeaders): string | undefined {
    return headers.authorization;
  },

  getBaseUrl(): string | undefined {
    return config.llm.perplexity.baseUrl;
  },

  getSpanName(): string {
    return 'perplexity.chat.completions';
  },

  createClient(
    apiKey: string | undefined,
    options?: CreateClientOptions
  ): PerplexityProvider {
    if (options?.mockMode) {
      return new MockOpenAIClient() as unknown as PerplexityProvider;
    }

    // Use observable fetch for request duration metrics if agent is provided
    const customFetch = options?.agent
      ? getObservableFetch('perplexity', options.agent, options.externalAgentId)
      : undefined;

    return new PerplexityProvider({
      apiKey,
      baseURL: options?.baseUrl,
      fetch: customFetch,
    });
  },

  async execute(
    client: unknown,
    request: PerplexityRequest
  ): Promise<PerplexityResponse> {
    const perplexityClient = client as PerplexityProvider;
    return perplexityClient.chat.completions.create({
      ...request,
      stream: false,
    }) as Promise<PerplexityResponse>;
  },

  async executeStream(
    client: unknown,
    request: PerplexityRequest
  ): Promise<AsyncIterable<PerplexityStreamChunk>> {
    const perplexityClient = client as PerplexityProvider;
    const stream = await perplexityClient.chat.completions.create({
      ...request,
      stream: true,
    });

    return {
      [Symbol.asyncIterator]: async function* () {
        for await (const chunk of stream) {
          yield chunk as PerplexityStreamChunk;
        }
      },
    };
  },

  extractErrorMessage(error: unknown): string {
    // OpenAI SDK error structure
    const perplexityMessage = get(error, "error.message");
    if (typeof perplexityMessage === 'string') {
      return perplexityMessage;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return "Internal server error";
  },
};
