export interface WelcomeMessage {
  text: string;
  persona: string;
}

export const LORA_WELCOME_MESSAGE: WelcomeMessage = {
  persona: 'Лора - опытный ассистент-продажник',
  text: `Привет! Я Лора, ваш персональный стилист. 
Помогу подобрать идеальную одежду, аксессуары или украшения. 
Что именно ищете?`,
};

// Можно добавить другие приветственные сообщения для разных ассистентов
export const PROFESSIONAL_WELCOME_MESSAGE: WelcomeMessage = {
  persona: 'Профессиональный консультант',
  text: `Добро пожаловать в наш магазин! Я ваш персональный консультант по стилю.
Помогу подобрать идеальные товары для любого случая. Чем могу быть полезен?`,
};

export function getWelcomeMessage(messageConfig: WelcomeMessage): string {
  return messageConfig.text;
}
