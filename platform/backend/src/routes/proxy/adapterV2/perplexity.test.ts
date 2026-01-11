import { describe, expect, test } from "@/test";
import type { Perplexity } from "@/types";
import { perplexityAdapterFactory } from "./perplexity";

function createMockResponse(
  message: Perplexity.Types.ChatCompletionsResponse["choices"][0]["message"],
  usage?: Partial<Perplexity.Types.Usage>,
): Perplexity.Types.ChatCompletionsResponse {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "sonar",
    choices: [
      {
        index: 0,
        message: {
          ...message,
          content: message.content ?? "",
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: usage?.prompt_tokens ?? 100,
      completion_tokens: usage?.completion_tokens ?? 50,
      total_tokens:
        (usage?.prompt_tokens ?? 100) + (usage?.completion_tokens ?? 50),
      search_context_size: usage?.search_context_size ?? null,
      citation_tokens: usage?.citation_tokens ?? null,
      reasoning_tokens: usage?.reasoning_tokens ?? null,
      num_search_queries: usage?.num_search_queries ?? null,
    },
  };
}

function createMockRequest(
  messages: Perplexity.Types.ChatCompletionsRequest["messages"],
  options?: Partial<Perplexity.Types.ChatCompletionsRequest>,
): Perplexity.Types.ChatCompletionsRequest {
  return {
    model: "sonar",
    messages,
    ...options,
  };
}

describe("PerplexityResponseAdapter", () => {
  describe("getText", () => {
    test("extracts text content from response", () => {
      const response = createMockResponse({
        role: "assistant",
        content: "Hello, world!",
      });

      const adapter = perplexityAdapterFactory.createResponseAdapter(response);
      expect(adapter.getText()).toBe("Hello, world!");
    });

    test("returns empty string when content is empty", () => {
      const response = createMockResponse({
        role: "assistant",
        content: "",
      });

      const adapter = perplexityAdapterFactory.createResponseAdapter(response);
      expect(adapter.getText()).toBe("");
    });
  });

  describe("getUsage", () => {
    test("extracts usage tokens from response", () => {
      const response = createMockResponse(
        { role: "assistant", content: "Test" },
        { prompt_tokens: 150, completion_tokens: 75 },
      );

      const adapter = perplexityAdapterFactory.createResponseAdapter(response);
      const usage = adapter.getUsage();

      expect(usage).toEqual({
        inputTokens: 150,
        outputTokens: 75,
      });
    });

    test("handles zero tokens", () => {
      const response = createMockResponse(
        { role: "assistant", content: "Test" },
        { prompt_tokens: 0, completion_tokens: 0 },
      );

      const adapter = perplexityAdapterFactory.createResponseAdapter(response);
      const usage = adapter.getUsage();

      expect(usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
      });
    });
  });

  describe("getId", () => {
    test("returns response id", () => {
      const response = createMockResponse({
        role: "assistant",
        content: "Test",
      });

      const adapter = perplexityAdapterFactory.createResponseAdapter(response);
      expect(adapter.getId()).toBe("chatcmpl-test");
    });
  });

  describe("getModel", () => {
    test("returns model from response", () => {
      const response = createMockResponse({
        role: "assistant",
        content: "Test",
      });

      const adapter = perplexityAdapterFactory.createResponseAdapter(response);
      expect(adapter.getModel()).toBe("sonar");
    });
  });
});

describe("PerplexityRequestAdapter", () => {
  describe("getModel", () => {
    test("returns model from request", () => {
      const request = createMockRequest(
        [{ role: "user", content: "Hello" }],
        { model: "sonar-pro" },
      );

      const adapter = perplexityAdapterFactory.createRequestAdapter(request);
      expect(adapter.getModel()).toBe("sonar-pro");
    });
  });

  describe("isStreaming", () => {
    test("returns true when stream is true", () => {
      const request = createMockRequest([{ role: "user", content: "Hello" }], {
        stream: true,
      });

      const adapter = perplexityAdapterFactory.createRequestAdapter(request);
      expect(adapter.isStreaming()).toBe(true);
    });

    test("returns false when stream is false", () => {
      const request = createMockRequest([{ role: "user", content: "Hello" }], {
        stream: false,
      });

      const adapter = perplexityAdapterFactory.createRequestAdapter(request);
      expect(adapter.isStreaming()).toBe(false);
    });

    test("returns false when stream is undefined", () => {
      const request = createMockRequest([{ role: "user", content: "Hello" }]);

      const adapter = perplexityAdapterFactory.createRequestAdapter(request);
      expect(adapter.isStreaming()).toBe(false);
    });
  });



  describe("getMessages", () => {
    test("converts messages to common format", () => {
      const request = createMockRequest([
        { role: "system", content: "You are a helpful assistant" },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ]);

      const adapter = perplexityAdapterFactory.createRequestAdapter(request);
      const messages = adapter.getMessages();

      expect(messages).toHaveLength(3);
      expect(messages[0].role).toBe("system");
      expect(messages[1].role).toBe("user");
      expect(messages[2].role).toBe("assistant");
    });
  });

  describe("toProviderRequest", () => {
    test("returns request with correct model", () => {
      const request = createMockRequest([{ role: "user", content: "Hello" }], {
        model: "sonar-pro",
      });

      const adapter = perplexityAdapterFactory.createRequestAdapter(request);
      const result = adapter.toProviderRequest();

      expect(result.model).toBe("sonar-pro");
    });

    test("preserves all request options", () => {
      const request = createMockRequest([{ role: "user", content: "Hello" }], {
        model: "sonar",
        temperature: 0.7,
        max_tokens: 1000,
        top_p: 0.9,
      });

      const adapter = perplexityAdapterFactory.createRequestAdapter(request);
      const result = adapter.toProviderRequest();

      expect(result.temperature).toBe(0.7);
      expect(result.max_tokens).toBe(1000);
      expect(result.top_p).toBe(0.9);
    });
  });
});

describe("perplexityAdapterFactory", () => {
  describe("extractApiKey", () => {
    test("returns authorization header as-is", () => {
      const headers = { authorization: "Bearer pplx-test-key-123" };
      const apiKey = perplexityAdapterFactory.extractApiKey(
        headers as Perplexity.Types.ChatCompletionsHeaders,
      );
      expect(apiKey).toBe("Bearer pplx-test-key-123");
    });

    test("returns undefined when no authorization header", () => {
      const headers = {} as unknown as Perplexity.Types.ChatCompletionsHeaders;
      const apiKey = perplexityAdapterFactory.extractApiKey(headers);
      expect(apiKey).toBeUndefined();
    });
  });

  describe("provider info", () => {
    test("has correct provider name", () => {
      expect(perplexityAdapterFactory.provider).toBe("perplexity");
    });

    test("has correct interaction type", () => {
      expect(perplexityAdapterFactory.interactionType).toBe(
        "perplexity:chatCompletions",
      );
    });
  });

  describe("getSpanName", () => {
    test("returns correct span name", () => {
      expect(perplexityAdapterFactory.getSpanName(false)).toBe(
        "perplexity.chat.completions",
      );
    });
  });
});

describe("PerplexityStreamAdapter", () => {
  describe("processChunk", () => {
    test("accumulates text content from chunks", () => {
      const streamAdapter = perplexityAdapterFactory.createStreamAdapter();

      const chunk1: Perplexity.Types.ChatCompletionChunk = {
        id: "chatcmpl-stream",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "sonar",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Hello" },
            message: { role: "assistant", content: "Hello" },
            finish_reason: null,
          },
        ],
      };

      const chunk2: Perplexity.Types.ChatCompletionChunk = {
        id: "chatcmpl-stream",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "sonar",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: ", world!" },
            message: { role: "assistant", content: ", world!" },
            finish_reason: null,
          },
        ],
      };

      streamAdapter.processChunk(chunk1);
      streamAdapter.processChunk(chunk2);

      expect(streamAdapter.state.text).toBe("Hello, world!");
    });

    test("captures usage from final chunk", () => {
      const streamAdapter = perplexityAdapterFactory.createStreamAdapter();

      const chunkWithUsage: Perplexity.Types.ChatCompletionChunk = {
        id: "chatcmpl-stream",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "sonar",
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          search_context_size: null,
          citation_tokens: null,
          reasoning_tokens: null,
          num_search_queries: null,
          cost: {
            input_tokens_cost: 0.001,
            output_tokens_cost: 0.002,
            total_cost: 0.003,
          },
        },
      };

      const result = streamAdapter.processChunk(chunkWithUsage);

      expect(result.isFinal).toBe(true);
      expect(streamAdapter.state.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        search_context_size: null,
        citation_tokens: null,
        reasoning_tokens: null,
        num_search_queries: null,
      });
    });

    test("detects final chunk by finish_reason", () => {
      const streamAdapter = perplexityAdapterFactory.createStreamAdapter();

      const finalChunk: Perplexity.Types.ChatCompletionChunk = {
        id: "chatcmpl-stream",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "sonar",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            message: { role: "assistant", content: "" },
            finish_reason: "stop",
          },
        ],
      };

      const result = streamAdapter.processChunk(finalChunk);

      expect(result.isFinal).toBe(true);
      expect(streamAdapter.state.stopReason).toBe("stop");
    });
  });

  describe("toProviderResponse", () => {
    test("builds complete response from accumulated state", () => {
      const streamAdapter = perplexityAdapterFactory.createStreamAdapter();

      // Simulate processing chunks by processing actual chunks
      const textChunk: Perplexity.Types.ChatCompletionChunk = {
        id: "chatcmpl-stream",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "sonar",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "Complete response text" },
            message: { role: "assistant", content: "Complete response text" },
            finish_reason: null,
          },
        ],
      };

      const finalChunk: Perplexity.Types.ChatCompletionChunk = {
        id: "chatcmpl-stream",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "sonar",
        choices: [
          {
            index: 0,
            delta: { role: "assistant", content: "" },
            message: { role: "assistant", content: "" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          search_context_size: null,
          citation_tokens: null,
          reasoning_tokens: null,
          num_search_queries: null,
          cost: {
            input_tokens_cost: 0.001,
            output_tokens_cost: 0.002,
            total_cost: 0.003,
          },
        },
      };

      streamAdapter.processChunk(textChunk);
      streamAdapter.processChunk(finalChunk);

      const response = streamAdapter.toProviderResponse();

      expect(response.id).toBe("chatcmpl-stream");
      expect(response.model).toBe("sonar");
      expect(response.choices[0].message.content).toBe("Complete response text");
      expect(response.choices[0].finish_reason).toBe("stop");
      expect(response.usage?.prompt_tokens).toBe(100);
      expect(response.usage?.completion_tokens).toBe(50);
    });
  });

  describe("getSSEHeaders", () => {
    test("returns correct SSE headers", () => {
      const streamAdapter = perplexityAdapterFactory.createStreamAdapter();
      const headers = streamAdapter.getSSEHeaders();

      expect(headers["Content-Type"]).toBe("text/event-stream");
      expect(headers["Cache-Control"]).toBe("no-cache");
      expect(headers["Connection"]).toBe("keep-alive");
    });
  });

  describe("formatTextDeltaSSE", () => {
    test("formats text delta as SSE data", () => {
      const streamAdapter = perplexityAdapterFactory.createStreamAdapter();
      streamAdapter.state.responseId = "chatcmpl-test";
      streamAdapter.state.model = "sonar";

      const sse = streamAdapter.formatTextDeltaSSE("Hello");

      expect(sse).toContain("data: ");
      expect(sse).toContain('"content":"Hello"');
      expect(sse).toContain('"role":"assistant"');
    });
  });

  describe("formatEndSSE", () => {
    test("formats end SSE with DONE marker", () => {
      const streamAdapter = perplexityAdapterFactory.createStreamAdapter();
      streamAdapter.state.responseId = "chatcmpl-test";
      streamAdapter.state.model = "sonar";
      streamAdapter.state.stopReason = "stop";

      const sse = streamAdapter.formatEndSSE();

      expect(sse).toContain('"finish_reason":"stop"');
      expect(sse).toContain("data: [DONE]");
    });
  });
});
