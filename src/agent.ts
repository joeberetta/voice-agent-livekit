// SPDX-FileCopyrightText: 2024 LiveKit, Inc.
//
// SPDX-License-Identifier: Apache-2.0
import { type JobContext, WorkerOptions, cli, defineAgent, llm, multimodal } from '@livekit/agents';
import * as openai from '@livekit/agents-plugin-openai';
import { BackgroundVoiceCancellation } from '@livekit/noise-cancellation-node';
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
    let agent: multimodal.MultimodalAgent | null = null;
    let session: openai.realtime.RealtimeSession | null = null;
    let isClosing = false;

    const cleanup = () => {
      if (isClosing) return;
      isClosing = true;

      if (session) {
        try {
          session.close();
        } catch (error) {
          console.warn('Error closing session:', error);
        }
      }
    };

    try {
      await ctx.connect();
      console.log('waiting for participant');
      const participant = await ctx.waitForParticipant();
      console.log(`starting Lora sales assistant agent for ${participant.identity}`);

      // Настраиваем системный промпт для Лоры
      const systemPrompt = getSystemPrompt(LORA_SALES_ASSISTANT);

      const model = new openai.realtime.RealtimeModel({
        instructions: systemPrompt,
        turnDetection: {
          type: 'server_vad',
          threshold: 0.6,
          prefix_padding_ms: 200,
          silence_duration_ms: 500,
        },
      });

      // Настраиваем функции для работы с товарами
      const productFunctions = new ProductFunctions();
      const fncCtx: llm.FunctionContext = productFunctions.getFunctionContext();

      agent = new multimodal.MultimodalAgent({
        model,
        fncCtx,
        noiseCancellation: BackgroundVoiceCancellation(),
      });

      // Обрабатываем события комнаты
      ctx.room.on('participantDisconnected', (disconnectedParticipant) => {
        console.log(`participant ${disconnectedParticipant.identity} left the room`);
        cleanup();
      });

      // Обрабатываем отключение комнаты
      ctx.room.on('disconnected', () => {
        console.log('room disconnected');
        cleanup();
      });

      session = await agent
        .start(ctx.room, participant)
        .then((session) => session as openai.realtime.RealtimeSession);

      // Обрабатываем ошибки сессии
      if (session) {
        session.on('error', (error) => {
          console.error('Session error:', error);
          cleanup();
        });
      }

      // Приветственное сообщение от Лоры
      if (session && !isClosing) {
        session.conversation.item.create(
          llm.ChatMessage.create({
            role: llm.ChatRole.ASSISTANT,
            text: getWelcomeMessage(LORA_WELCOME_MESSAGE),
          }),
        );

        session.response.create();
      }

      // Ждем пока сессия не закроется
      while (session && !isClosing) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      console.error('Agent error:', error);
    } finally {
      // Финальная очистка ресурсов
      if (!isClosing) {
        cleanup();
      }

      if (agent) {
        try {
          // Если есть метод для остановки агента
          if ('stop' in agent && typeof agent.stop === 'function') {
            await agent.stop();
          }
        } catch (error) {
          console.warn('Error stopping agent:', error);
        }
      }

      console.log('Agent cleanup completed');
    }
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
