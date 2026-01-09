import { z } from 'zod';

/**
 * Supported LLM providers
 */
export const SupportedProvidersSchema = z.enum([
  'openai',
  'perplexity',
  'gemini',
  'anthropic',
]);

export const SupportedProvidersDiscriminatorSchema = z.enum([
  'openai:chatCompletions',
  'perplexity:chatCompletions',
  'gemini:generateContent',
  'anthropic:messages',
]);

export const SupportedProviders = Object.values(SupportedProvidersSchema.enum);
export type SupportedProvider = z.infer<typeof SupportedProvidersSchema>;
export type SupportedProviderDiscriminator = z.infer<
  typeof SupportedProvidersDiscriminatorSchema
>;

export const providerDisplayNames: Record<SupportedProvider, string> = {
  openai: 'OpenAI',
  perplexity: 'Perplexity',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
};
