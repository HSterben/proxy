import { action } from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';
import { generateAI, weightedTokensFromUsage, type ChatMessage } from './ai/provider';
import { resolveAiModelWithSource } from './ai/model';
import { withProxyIdentity } from './ai/identity';

function buildMessages(args: {
  message?: string;
  messages?: ChatMessage[];
  systemInstruction?: string;
}): ChatMessage[] {
  let messages: ChatMessage[] = [];
  const system = withProxyIdentity(args.systemInstruction);

  if (args.messages && args.messages.length > 0) {
    messages = args.messages
      .filter((msg) => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

    messages.unshift({
      role: 'system',
      content: system,
    });

    if (args.message) {
      messages.push({ role: 'user', content: args.message });
    }
  } else {
    if (!args.message) {
      throw new Error('Either message or messages array must be provided');
    }
    messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: args.message });
  }

  return messages;
}

/** Authenticated non-streaming chat via OpenAI Luna (provider abstraction). */
export const sendMessage = action({
  args: {
    message: v.optional(v.string()),
    messages: v.optional(
      v.array(
        v.object({
          role: v.union(
            v.literal('system'),
            v.literal('user'),
            v.literal('assistant')
          ),
          content: v.union(
            v.string(),
            v.array(
              v.union(
                v.object({
                  type: v.literal('text'),
                  text: v.string(),
                }),
                v.object({
                  type: v.literal('image_url'),
                  image_url: v.object({
                    url: v.string(),
                  }),
                })
              )
            )
          ),
        })
      )
    ),
    model: v.optional(v.string()),
    systemInstruction: v.optional(v.string()),
    temperature: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
    topP: v.optional(v.number()),
    frequencyPenalty: v.optional(v.number()),
    presencePenalty: v.optional(v.number()),
    stop: v.optional(v.union(v.string(), v.array(v.string()))),
    stream: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    content: v.string(),
    model: v.string(),
    usage: v.object({
      promptTokens: v.number(),
      completionTokens: v.number(),
      totalTokens: v.number(),
    }),
    finishReason: v.string(),
    id: v.string(),
    messages: v.optional(
      v.array(
        v.object({
          role: v.union(
            v.literal('system'),
            v.literal('user'),
            v.literal('assistant')
          ),
          content: v.union(
            v.string(),
            v.array(
              v.union(
                v.object({
                  type: v.literal('text'),
                  text: v.string(),
                }),
                v.object({
                  type: v.literal('image_url'),
                  image_url: v.object({
                    url: v.string(),
                  }),
                })
              )
            )
          ),
        })
      )
    ),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error(
        'Authentication required. Please log in to use this feature.'
      );
    }

    if (!args.message && (!args.messages || args.messages.length === 0)) {
      throw new Error('Either message or messages array is required');
    }

    const workosId = identity.subject;
    const gate = await ctx.runQuery(internal.usage.assertCanUseAI, { workosId });
    if (gate.ok === false) {
      throw new Error(gate.reason ?? 'Not allowed to use AI');
    }

    const { model } = resolveAiModelWithSource(args.model);
    const messages = buildMessages({
      message: args.message,
      messages: args.messages as ChatMessage[] | undefined,
      systemInstruction: args.systemInstruction,
    });

    const result = await generateAI({
      messages,
      model,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      topP: args.topP,
      frequencyPenalty: args.frequencyPenalty,
      presencePenalty: args.presencePenalty,
      stop: args.stop,
    });

    const inputTokens = result.usage.prompt_tokens;
    const outputTokens = result.usage.completion_tokens;
    const weightedTokens = weightedTokensFromUsage(result.usage);

    await ctx.runMutation(internal.usage.addUsage, {
      workosId,
      inputTokens,
      outputTokens,
      weightedTokens,
    });

    return {
      success: true,
      content: result.content,
      model: result.model,
      usage: {
        promptTokens: inputTokens,
        completionTokens: outputTokens,
        totalTokens: result.usage.total_tokens,
      },
      finishReason: result.finishReason,
      id: result.id,
      messages: result.messages,
    };
  },
});
