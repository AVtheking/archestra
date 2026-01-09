import { z } from 'zod';

export const ChatCompletionUsageSchema = z
  .object({
    completion_tokens: z.number(),
    prompt_tokens: z.number(),
    total_tokens: z.number(),
    search_context_size: z.string().nullable(),
    citation_tokens: z.number().nullable(),
    reasoning_tokens: z.number().nullable(),
    num_search_queries: z.number().nullable(),
  })
  .describe(
    `https://docs.perplexity.ai/api-reference/chat-completions-post#response-usage`
  );

export const FinishReasonSchema = z.enum(['stop', 'length']).nullable();

const ChoiceSchema = z
  .object({
    finish_reason: FinishReasonSchema,
    index: z.number(),
    message: z
      .object({
        content: z.string(),
        role: z.enum(['assistant']),
      })
      .describe(
        `https://docs.perplexity.ai/api-reference/chat-completions-post#response-choices-items-message`
      ),
  })
  .describe(
    `https://docs.perplexity.ai/api-reference/chat-completions-post#response-choices`
  );

const UserLocationSchema = z.object({
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  country: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
});

const WebSearchOptionsSchema = z
  .object({
    search_context_size: z.enum(['low', 'medium', 'high']).optional(),
    user_location: UserLocationSchema.optional(),
    image_search_relevance_enhancement: z.boolean().optional(),
  })
  .optional()
  .describe(
    `https://docs.perplexity.ai/api-reference/chat-completions-post#body-web-search-options`
  );

const MediaResponseSchema = z
  .object({
    overrides: z
      .object({
        return_videos: z.boolean().optional(),
        return_images: z.boolean().optional(),
      })
      .optional(),
  })
  .optional()
  .describe(
    `https://docs.perplexity.ai/api-reference/chat-completions-post#body-media-response`
  );

export const SearchResultsSchema = z.object({
  title: z.string(),
  url: z.url(),
  date: z.iso.date().nullable(),
});

export const VideoResultsSchema = z.object({
  url: z.url(),
  thumbnail_url: z.url().nullable(),
  thumbnail_width: z.number().nullable(),
  thumbnail_height: z.number().nullable(),
  duration: z.number().nullable(),
});

export const MessageSchema = z
  .object({
    content: z.string(),
    role: z.enum(['system', 'user', 'assistant']),
  })
  .describe(
    `https://docs.perplexity.ai/api-reference/chat-completions-post#body-messages`
  );

export const PerplexityModel = z.enum([
  'sonar',
  'sonar-pro',
  'sonar-deep-research',
  'sonar-reasoning-pro',
]);

const ResponseFormatTextSchema = z.object({
  type: z.literal('text'),
});

const ResponseFormatJsonSchemaSchema = z.object({
  type: z.literal('json_schema'),
  json_schema: z.object({
    schema: z.record(z.string(), z.unknown()),
    description: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    strict: z.boolean().nullable().optional(),
  }),
});

const ResponseFormatRegexSchema = z.object({
  type: z.literal('regex'),
  regex: z.object({
    regex: z.string(),
    description: z.string().nullable().optional(),
    name: z.string().nullable().optional(),
    strict: z.boolean().nullable().optional(),
  }),
});

const ResponseFormatSchema = z
  .union([
    ResponseFormatTextSchema,
    ResponseFormatJsonSchemaSchema,
    ResponseFormatRegexSchema,
  ])
  .nullable()
  .optional();

export const ChatCompletionRequestSchema = z
  .object({
    model: PerplexityModel,
    messages: z.array(MessageSchema),
    max_tokens: z.number().optional(),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().optional(),
    top_k: z.number().optional(),
    stream: z.boolean().optional(),
    presence_penalty: z.number().optional(),
    frequency_penalty: z.number().optional(),
    response_format: ResponseFormatSchema.optional(),
    search_mode: z.enum(['academic', 'sec', 'web']).optional(),
    reasoning_effort: z.enum(['low', 'medium', 'high']).optional(),
    language_preference: z.string().optional(),
    search_domain_filter: z.array(z.string()).optional(),
    return_images: z.boolean().optional(),
    return_related_questions: z.boolean().optional(),
    search_recency_filter: z
      .enum(['hour', 'day', 'week', 'month', 'year'])
      .optional(),
    search_after_date_filter: z.string().optional(),
    search_before_date_filter: z.string().optional(),
    last_updated_after_filter: z.string().optional(),
    last_updated_before_filter: z.string().optional(),
    disable_search: z.boolean().optional(),
    enable_search_classifier: z.boolean().optional(),
    web_search_options: WebSearchOptionsSchema,
    media_response: MediaResponseSchema,
  })
  .describe(
    `https://docs.perplexity.ai/api-reference/chat-completions-post#body`
  );

export const ChatCompletionResponseSchema = z
  .object({
    id: z.string(),
    choices: z.array(ChoiceSchema),
    search_results: z.array(SearchResultsSchema).nullish(),
    videos: z.array(VideoResultsSchema).nullish(),
    created: z.number(),
    model: z.string(),
    object: z.enum(['chat.completion']),
    usage: ChatCompletionUsageSchema,
  })
  .describe(
    `https://docs.perplexity.ai/api-reference/chat-completions-post#response-id`
  );

export const ChatCompletionsHeadersSchema = z.object({
  'user-agent': z.string().optional().describe('The user agent of the client'),
  authorization: z
    .string()
    .describe('Bearer token for Perplexity API')
    .transform((authorization) => authorization.replace('Bearer ', '')),
});

export type ChatCompletionRequest = z.infer<typeof ChatCompletionRequestSchema>;
export type ChatCompletionResponse = z.infer<
  typeof ChatCompletionResponseSchema
>;
export type ChatCompletionUsage = z.infer<typeof ChatCompletionUsageSchema>;
export type PerplexityModel = z.infer<typeof PerplexityModel>;
