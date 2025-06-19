// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type JobContext, WorkerOptions, cli, defineAgent, llm, multimodal } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// Импортируем наши модули
import { LORA_SALES_ASSISTANT, getSystemPrompt } from './config/system-prompts.js';
import { LORA_WELCOME_MESSAGE, getWelcomeMessage } from './config/welcome-messages.js';
import { ProductFunctions } from './functions/product-functions.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '../.env.local');
dotenv.config({ path: envPath });

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log('waiting for participant');
    const participant = await ctx.waitForParticipant();
    console.log(`starting Lora sales assistant agent for ${participant.identity}`);

    // Настраиваем системный промпт для Лоры
    const systemPrompt = getSystemPrompt(LORA_SALES_ASSISTANT);

    const model = new openai.realtime.RealtimeModel({
      instructions: systemPrompt,
    });

    // Настраиваем функции для работы с товарами
    const productFunctions = new ProductFunctions();
    const fncCtx: llm.FunctionContext = productFunctions.getFunctionContext();

    const agent = new multimodal.MultimodalAgent({ model, fncCtx });
    const session = await agent
      .start(ctx.room, participant)
      .then((session) => session as openai.realtime.RealtimeSession);

    // Приветственное сообщение от Лоры
    session.conversation.item.create(
      llm.ChatMessage.create({
        role: llm.ChatRole.ASSISTANT,
        text: getWelcomeMessage(LORA_WELCOME_MESSAGE),
      }),
    );

    session.response.create();
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
