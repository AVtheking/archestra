/**
 * NOTE: this is a bit of a PITA/verbose but in order to properly type everything that we are
 * proxing.. this is kinda necessary.
 *
 * the openai ts sdk doesn't expose zod schemas for all of this..
 */
import type OpenAIProvider from 'openai';
import type PerplexityProvider from '@perplexity-ai/perplexity_ai';
import type { z } from 'zod';
import * as PerplexityAPI from './api';

namespace Perplexity {
  export const API = PerplexityAPI;

  export namespace Types {
    export type ChatCompletionsHeaders = z.infer<
      typeof PerplexityAPI.ChatCompletionsHeadersSchema
    >;
    export type ChatCompletionsRequest = z.infer<
      typeof PerplexityAPI.ChatCompletionRequestSchema
    >;
    export type ChatCompletionsResponse = z.infer<
      typeof PerplexityAPI.ChatCompletionResponseSchema
    >;
    export type Usage = z.infer<typeof PerplexityAPI.ChatCompletionUsageSchema>;

    export type FinishReason = z.infer<typeof PerplexityAPI.FinishReasonSchema>;
    export type Message = z.infer<typeof PerplexityAPI.MessageSchema>;
    export type Role = Message['role'];

    export type ChatCompletionChunk = PerplexityProvider.Chat.StreamChunk;
    export type SearchResult = PerplexityProvider.APIPublicSearchResult;
  }
}

export default Perplexity;
