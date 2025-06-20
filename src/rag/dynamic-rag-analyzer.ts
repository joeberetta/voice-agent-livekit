import { ProductSearchOptions } from './product-rag.js';
import { Product } from './products.js';

export interface CategoryRelation {
  category: string;
  relatedCategories: string[];
  complementaryQueries: string[];
}

export interface SynonymGroup {
  baseWord: string;
  synonyms: string[];
  frequency: number;
}

export class DynamicRAGAnalyzer {
  private products: Product[];
  private synonymCache: Map<string, string[]> = new Map();
  private categoryRelations: Map<string, CategoryRelation> = new Map();
  private lastAnalysisTime: number = 0;
  private analysisInterval: number = 24 * 60 * 60 * 1000; // 24 часа

  constructor(products: Product[]) {
    this.products = products;
    this.analyzeProducts();
  }

  updateProducts(products: Product[]) {
    this.products = products;
    this.clearCache();
    this.analyzeProducts();
  }

  private clearCache() {
    this.synonymCache.clear();
    this.categoryRelations.clear();
  }

  private analyzeProducts() {
    const now = Date.now();
    if (now - this.lastAnalysisTime < this.analysisInterval) {
      return; // Не анализируем слишком часто
    }

    console.log('🔍 Анализирую каталог товаров для создания динамических связей...');

    this.generateDynamicSynonyms();
    this.analyzeCategoryRelations();
    this.lastAnalysisTime = now;

    console.log(
      `✅ Анализ завершен: ${this.synonymCache.size} групп синонимов, ${this.categoryRelations.size} категорийных связей`,
    );
  }

  private generateDynamicSynonyms() {
    // Базовые синонимы (всегда актуальны)
    const baseSynonyms: [string, string[]][] = [
      // Цвета
      ['черный', ['black', 'темный']],
      ['белый', ['white', 'светлый']],
      ['красный', ['red', 'алый', 'бордовый']],
      ['синий', ['blue', 'голубой', 'темно-синий']],
      ['зеленый', ['green', 'салатовый', 'изумрудный']],
      ['желтый', ['yellow', 'золотистый']],
      ['серый', ['gray', 'grey', 'серебристый']],
      ['коричневый', ['brown', 'бежевый', 'кофейный']],

      // Базовые материалы
      ['кожа', ['leather', 'кожаный']],
      ['хлопок', ['cotton', 'хлопковый']],
      ['шелк', ['silk', 'шелковый']],
      ['шерсть', ['wool', 'шерстяной']],
    ];

    // Добавляем базовые синонимы
    baseSynonyms.forEach(([key, values]) => {
      this.synonymCache.set(key, values);
    });

    // Динамически анализируем товары
    const wordFrequency = new Map<string, Set<string>>();
    const categoryWords = new Map<string, Set<string>>();

    this.products.forEach((product) => {
      const words = this.extractWords(product);

      // Группируем слова по категориям
      if (!categoryWords.has(product.category)) {
        categoryWords.set(product.category, new Set());
      }

      words.forEach((word) => {
        categoryWords.get(product.category)!.add(word);

        if (!wordFrequency.has(word)) {
          wordFrequency.set(word, new Set());
        }
        wordFrequency.get(word)!.add(product.id);
      });
    });

    // Генерируем синонимы на основе анализа
    this.generateCategoryBasedSynonyms(categoryWords);
    this.generatePatternBasedSynonyms();
  }

  private extractWords(product: Product): string[] {
    const text = [
      product.name,
      product.description,
      product.subcategory,
      ...product.tags,
      ...product.colors,
    ]
      .join(' ')
      .toLowerCase();

    // Извлекаем значимые слова (длиннее 2 символов, не стоп-слова)
    const stopWords = new Set([
      'для',
      'или',
      'это',
      'как',
      'так',
      'что',
      'где',
      'когда',
      'чем',
      'все',
      'под',
      'над',
      'при',
    ]);

    return text
      .split(/[^а-яёa-z]+/i)
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .map((word) => word.toLowerCase());
  }

  private generateCategoryBasedSynonyms(categoryWords: Map<string, Set<string>>) {
    const categoryMappings: Record<string, string[]> = {
      clothing: ['одежда', 'платье', 'рубашка', 'брюки', 'джинсы', 'куртка', 'свитер', 'футболка'],
      shoes: ['обувь', 'туфли', 'кроссовки', 'ботинки', 'сандалии'],
      accessories: ['аксессуары', 'сумка', 'часы', 'шарф', 'платок'],
      jewelry: ['украшения', 'кольцо', 'серьги', 'цепочка', 'браслет'],
      underwear: ['белье', 'трусы', 'бюстгальтер'],
    };

    Object.entries(categoryMappings).forEach(([category, baseWords]) => {
      const categoryWordSet = categoryWords.get(category);
      if (!categoryWordSet) return;

      baseWords.forEach((baseWord) => {
        const synonyms = Array.from(categoryWordSet).filter(
          (word) =>
            word.includes(baseWord) ||
            baseWord.includes(word) ||
            this.calculateSimilarity(word, baseWord) > 0.6,
        );

        if (synonyms.length > 0) {
          const existing = this.synonymCache.get(baseWord) || [];
          this.synonymCache.set(baseWord, [...existing, ...synonyms]);
        }
      });
    });
  }

  private generatePatternBasedSynonyms() {
    // Находим слова, которые часто встречаются вместе в одних товарах
    const commonPairs = new Map<string, Map<string, number>>();

    this.products.forEach((product) => {
      const words = this.extractWords(product);

      for (let i = 0; i < words.length; i++) {
        for (let j = i + 1; j < words.length; j++) {
          const word1 = words[i];
          const word2 = words[j];

          if (!commonPairs.has(word1)) {
            commonPairs.set(word1, new Map());
          }

          const pairCount = commonPairs.get(word1)!.get(word2) || 0;
          commonPairs.get(word1)!.set(word2, pairCount + 1);
        }
      }
    });

    // Создаем синонимы для часто встречающихся пар
    commonPairs.forEach((pairs, word1) => {
      pairs.forEach((count, word2) => {
        if (count >= 2 && this.areWordsSimilar(word1, word2)) {
          const existing1 = this.synonymCache.get(word1) || [];
          const existing2 = this.synonymCache.get(word2) || [];

          if (!existing1.includes(word2)) {
            this.synonymCache.set(word1, [...existing1, word2]);
          }
          if (!existing2.includes(word1)) {
            this.synonymCache.set(word2, [...existing2, word1]);
          }
        }
      });
    });
  }

  private areWordsSimilar(word1: string, word2: string): boolean {
    // Проверяем семантическое сходство слов
    if (word1.length < 3 || word2.length < 3) return false;

    // Один содержит другого
    if (word1.includes(word2) || word2.includes(word1)) return true;

    // Похожие корни
    const similarity = this.calculateSimilarity(word1, word2);
    return similarity > 0.7;
  }

  private calculateSimilarity(str1: string, str2: string): number {
    // Простой алгоритм Левенштейна для схожести строк
    const matrix = Array(str2.length + 1)
      .fill(null)
      .map(() => Array(str1.length + 1).fill(null));

    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator,
        );
      }
    }

    const maxLen = Math.max(str1.length, str2.length);
    return maxLen === 0 ? 1 : (maxLen - matrix[str2.length][str1.length]) / maxLen;
  }

  private analyzeCategoryRelations() {
    // Анализируем теги товаров для определения связей между категориями
    const categoryTagMap = new Map<string, Map<string, number>>();
    const categoryGenderMap = new Map<string, Set<string>>();

    this.products.forEach((product) => {
      if (!categoryTagMap.has(product.category)) {
        categoryTagMap.set(product.category, new Map());
        categoryGenderMap.set(product.category, new Set());
      }

      const tagMap = categoryTagMap.get(product.category)!;
      const genderSet = categoryGenderMap.get(product.category)!;

      product.tags.forEach((tag) => {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      });

      genderSet.add(product.gender);
    });

    // Генерируем связи между категориями
    const categories = Array.from(categoryTagMap.keys());

    categories.forEach((category) => {
      const relation: CategoryRelation = {
        category,
        relatedCategories: [],
        complementaryQueries: [],
      };

      // Определяем связанные категории по общим тегам
      const categoryTags = categoryTagMap.get(category)!;
      const topTags = Array.from(categoryTags.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([tag]) => tag);

      categories.forEach((otherCategory) => {
        if (otherCategory === category) return;

        const otherTags = categoryTagMap.get(otherCategory)!;
        const commonTags = topTags.filter((tag) => otherTags.has(tag));

        if (commonTags.length > 0) {
          relation.relatedCategories.push(otherCategory);
        }
      });

      // Генерируем поисковые запросы для дополняющих товаров
      relation.complementaryQueries = this.generateComplementaryQueries(
        category,
        topTags,
        relation.relatedCategories,
      );

      this.categoryRelations.set(category, relation);
    });
  }

  private generateComplementaryQueries(
    category: string,
    topTags: string[],
    relatedCategories: string[],
  ): string[] {
    const queries: string[] = [];

    // Базовые правила дополнения
    const complementaryRules: Record<string, string[]> = {
      clothing: ['accessories', 'shoes', 'jewelry'],
      shoes: ['clothing', 'accessories'],
      accessories: ['clothing', 'jewelry'],
      jewelry: ['clothing', 'accessories'],
      underwear: ['clothing'],
    };

    const baseComplements = complementaryRules[category] || [];

    // Добавляем базовые категории
    baseComplements.forEach((comp) => {
      if (relatedCategories.includes(comp)) {
        queries.push(this.getCategorySearchTerms(comp).join(' '));
      }
    });

    // Добавляем запросы на основе тегов
    const styleBasedQueries = topTags
      .filter((tag) => ['классический', 'спортивный', 'элегантный', 'повседневный'].includes(tag))
      .map((tag) => `${tag} ${baseComplements.join(' ')}`);

    queries.push(...styleBasedQueries.slice(0, 2));

    return queries.filter((q) => q.length > 0);
  }

  private getCategorySearchTerms(category: string): string[] {
    const terms: Record<string, string[]> = {
      clothing: ['одежда', 'платье', 'рубашка'],
      shoes: ['обувь', 'туфли', 'кроссовки'],
      accessories: ['аксессуары', 'сумка'],
      jewelry: ['украшения', 'кольцо'],
      underwear: ['белье'],
    };

    return terms[category] || [category];
  }

  // Публичные методы для получения данных
  getDynamicSynonyms(): Map<string, string[]> {
    this.analyzeProducts(); // Проверяем, нужно ли обновить
    return new Map(this.synonymCache);
  }

  getComplementaryQueries(
    product: Product,
  ): Array<{ query: string; options: ProductSearchOptions }> {
    this.analyzeProducts(); // Проверяем, нужно ли обновить

    const relation = this.categoryRelations.get(product.category);
    if (!relation) {
      return this.getFallbackComplementaryQueries(product);
    }

    const queries: Array<{ query: string; options: ProductSearchOptions }> = [];

    relation.complementaryQueries.forEach((query) => {
      queries.push({
        query,
        options: {
          gender: product.gender,
          inStock: true,
        },
      });
    });

    return queries.slice(0, 3); // Ограничиваем количество
  }

  private getFallbackComplementaryQueries(
    product: Product,
  ): Array<{ query: string; options: ProductSearchOptions }> {
    // Fallback правила если динамический анализ не дал результатов
    const fallbackRules: Record<string, string[]> = {
      clothing: ['сумка аксессуары', 'украшения'],
      shoes: ['одежда', 'сумка'],
      accessories: ['одежда', 'украшения'],
      jewelry: ['аксессуары', 'одежда'],
      underwear: ['одежда'],
    };

    const queries = fallbackRules[product.category] || ['аксессуары'];

    return queries.map((query) => ({
      query,
      options: {
        gender: product.gender,
        inStock: true,
      },
    }));
  }

  // Метод для получения статистики анализа
  getAnalysisStats() {
    return {
      totalProducts: this.products.length,
      synonymGroups: this.synonymCache.size,
      categoryRelations: this.categoryRelations.size,
      lastAnalysis: new Date(this.lastAnalysisTime).toLocaleString('ru-RU'),
    };
  }
}
