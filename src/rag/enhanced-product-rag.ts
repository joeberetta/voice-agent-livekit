import * as JsSearch from 'js-search';
import { DynamicRAGAnalyzer } from './dynamic-rag-analyzer.js';
import type { ProductSearchOptions } from './product-rag.js';
import { PRODUCT_DATABASE, type Product } from './products.js';

export class EnhancedProductRAG {
  private products: Product[];
  private searchIndex!: JsSearch.Search;
  private synonyms: Map<string, string[]> = new Map();
  private dynamicAnalyzer: DynamicRAGAnalyzer;

  constructor(products: Product[] = PRODUCT_DATABASE) {
    this.products = products;
    this.dynamicAnalyzer = new DynamicRAGAnalyzer(products);
    this.setupSynonyms();
    this.setupSearchIndex();
  }

  // Метод для обновления каталога товаров
  updateProducts(products: Product[]) {
    this.products = products;
    this.dynamicAnalyzer.updateProducts(products);
    this.setupSynonyms(); // Обновляем синонимы
    this.setupSearchIndex(); // Переиндексируем
  }

  private setupSynonyms() {
    // Получаем динамически сгенерированные синонимы
    this.synonyms = this.dynamicAnalyzer.getDynamicSynonyms();
  }

  private setupSearchIndex() {
    this.searchIndex = new JsSearch.Search('id');
    this.searchIndex.indexStrategy = new JsSearch.AllSubstringsIndexStrategy();
    this.searchIndex.sanitizer = new JsSearch.LowerCaseSanitizer();
    this.searchIndex.searchIndex = new JsSearch.TfIdfSearchIndex('id');

    // Индексируем поля для поиска
    this.searchIndex.addIndex('name');
    this.searchIndex.addIndex('description');
    this.searchIndex.addIndex('subcategory');
    this.searchIndex.addIndex('searchText');

    // Добавляем документы с расширенными данными для поиска
    const documentsForSearch = this.products.map((product) => ({
      ...product,
      searchText: this.buildSearchText(product),
    }));

    this.searchIndex.addDocuments(documentsForSearch);
  }

  private buildSearchText(product: Product): string {
    // Создаем расширенный текст для поиска, включая синонимы
    let searchText = [
      product.name,
      product.description,
      product.subcategory,
      product.category,
      ...product.tags,
      ...product.colors,
    ]
      .join(' ')
      .toLowerCase();

    // Добавляем синонимы
    for (const [key, synonyms] of this.synonyms) {
      if (searchText.includes(key)) {
        searchText += ' ' + synonyms.join(' ');
      }
    }

    return searchText;
  }

  searchProducts(query: string, options: ProductSearchOptions = {}): Product[] {
    let results: Product[];

    if (!query.trim()) {
      results = this.products;
    } else {
      // Расширяем поисковый запрос синонимами
      const expandedQuery = this.expandQueryWithSynonyms(query);

      // Используем полнотекстовый поиск
      const searchResults = this.searchIndex.search(expandedQuery) as Product[];

      // Если результатов мало, попробуем более мягкий поиск
      if (searchResults.length < 3) {
        const words = query.toLowerCase().split(' ');
        const flexibleResults = new Set<Product>();

        for (const word of words) {
          const wordResults = this.searchIndex.search(word) as Product[];
          wordResults.forEach((p) => flexibleResults.add(p));
        }

        results = Array.from(flexibleResults);
      } else {
        results = searchResults;
      }
    }

    // Применяем фильтры
    const filtered = this.applyFilters(results, options);

    // Сортируем по релевантности
    return this.scoreAndSortResults(filtered, query);
  }

  private expandQueryWithSynonyms(query: string): string {
    const words = query.toLowerCase().split(' ');
    const expandedWords = new Set(words);

    for (const word of words) {
      for (const [key, synonyms] of this.synonyms) {
        if (word.includes(key) || synonyms.some((syn) => word.includes(syn))) {
          expandedWords.add(key);
          synonyms.forEach((syn) => expandedWords.add(syn));
        }
      }
    }

    return Array.from(expandedWords).join(' ');
  }

  private applyFilters(products: Product[], options: ProductSearchOptions): Product[] {
    let filtered = products;

    if (options.category) {
      filtered = filtered.filter((p) => p.category === options.category);
    }
    if (options.gender) {
      filtered = filtered.filter((p) => p.gender === options.gender || p.gender === 'unisex');
    }
    if (options.inStock !== undefined) {
      filtered = filtered.filter((p) => p.inStock === options.inStock);
    }
    if (options.priceRange) {
      filtered = filtered.filter(
        (p) => p.price >= options.priceRange!.min && p.price <= options.priceRange!.max,
      );
    }
    if (options.colors && options.colors.length > 0) {
      filtered = filtered.filter((p) =>
        options.colors!.some((color) =>
          p.colors.some((pColor) => pColor.toLowerCase().includes(color.toLowerCase())),
        ),
      );
    }
    if (options.sizes && options.sizes.length > 0) {
      filtered = filtered.filter((p) => options.sizes!.some((size) => p.sizes.includes(size)));
    }

    return filtered;
  }

  private scoreAndSortResults(products: Product[], query: string): Product[] {
    if (!query.trim()) return products;

    return (
      products
        .map((product) => {
          let score = 0;
          const queryLower = query.toLowerCase();

          // Точное совпадение в названии = высший приоритет
          if (product.name.toLowerCase().includes(queryLower)) score += 10;

          // Совпадение в начале названия
          if (product.name.toLowerCase().startsWith(queryLower)) score += 15;

          // Совпадение в тегах
          if (product.tags.some((tag) => tag.toLowerCase().includes(queryLower))) score += 5;

          // Совпадение в категории/подкатегории
          if (product.subcategory.toLowerCase().includes(queryLower)) score += 3;
          if (product.category.toLowerCase().includes(queryLower)) score += 2;

          // Товары в наличии приоритетнее
          if (product.inStock) score += 1;

          return { ...product, searchScore: score };
        })
        .sort((a, b) => b.searchScore - a.searchScore)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        .map(({ searchScore, ...product }) => product)
    );
  }

  // Семантический поиск похожих товаров
  findSimilarProducts(productId: string, limit: number = 5): Product[] {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return [];

    // Создаем поисковый запрос на основе характеристик товара
    const similarityQuery = [
      product.subcategory,
      ...product.tags.slice(0, 3), // берем первые 3 тега
      product.colors[0], // основной цвет
    ].join(' ');

    const similar = this.searchProducts(similarityQuery)
      .filter((p) => p.id !== productId)
      .filter(
        (p) =>
          p.category === product.category || p.gender === product.gender || p.gender === 'unisex',
      )
      .slice(0, limit);

    return similar;
  }

  // Автодополнение и предложения
  getSuggestions(partialQuery: string): string[] {
    const suggestions = new Set<string>();
    const query = partialQuery.toLowerCase();

    if (query.length < 2) return [];

    this.products.forEach((product) => {
      // Предложения из названий
      if (product.name.toLowerCase().includes(query)) {
        suggestions.add(product.name);
      }

      // Предложения из тегов
      product.tags.forEach((tag) => {
        if (tag.toLowerCase().includes(query) && tag.length > 2) {
          suggestions.add(tag);
        }
      });

      // Предложения из подкатегорий
      if (product.subcategory.toLowerCase().includes(query)) {
        suggestions.add(product.subcategory);
      }
    });

    return Array.from(suggestions).slice(0, 8);
  }

  getProduct(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  getProductsByCategory(category: string): Product[] {
    return this.products.filter((p) => p.category === category);
  }

  getComplementaryProducts(productId: string): Product[] {
    // Используем динамический анализ для поиска дополняющих товаров
    const product = this.getProduct(productId);
    if (!product) return [];

    const complementaryQueries = this.dynamicAnalyzer.getComplementaryQueries(product);
    const complementary = new Set<Product>();

    for (const queryConfig of complementaryQueries) {
      const results = this.searchProducts(queryConfig.query, queryConfig.options);
      results.slice(0, 3).forEach((p) => {
        if (p.id !== productId && p.inStock) {
          complementary.add(p);
        }
      });
    }

    return Array.from(complementary).slice(0, 5);
  }

  formatProductForLLM(product: Product): string {
    const categoryNames: Record<string, string> = {
      clothing: 'Одежда',
      accessories: 'Аксессуары',
      jewelry: 'Ювелирные изделия',
      shoes: 'Обувь',
      underwear: 'Нижнее белье',
    };

    return `Товар id: ${product.id}
Название: ${product.name}
Категория: ${categoryNames[product.category] || product.category} - ${product.subcategory}
Цена: ${product.price} руб.
Описание: ${product.description}
Доступные цвета: ${product.colors.join(', ')}
Размеры: ${product.sizes.join(', ')}  
В наличии: ${product.inStock ? 'Да' : 'Нет'}
Теги: ${product.tags.join(', ')}`;
  }

  formatProductsForLLM(products: Product[]): string {
    if (products.length === 0) {
      return 'К сожалению, товары по вашему запросу не найдены.';
    }

    return products.map((product) => this.formatProductForLLM(product)).join('\n\n---\n\n');
  }

  getCategoryStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.products.forEach((product) => {
      stats[product.category] = (stats[product.category] || 0) + 1;
    });
    return stats;
  }

  getAvailableCategories(): string[] {
    return [...new Set(this.products.map((p) => p.category))];
  }

  // Получить статистику динамического анализа
  getAnalysisStats() {
    return this.dynamicAnalyzer.getAnalysisStats();
  }
}
