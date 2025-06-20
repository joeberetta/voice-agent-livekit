import { PRODUCT_DATABASE, type Product } from './products.js';

export interface ProductSearchOptions {
  category?: string;
  gender?: string;
  priceRange?: { min: number; max: number };
  colors?: string[];
  sizes?: string[];
  inStock?: boolean;
  tags?: string[];
}

export class ProductRAG {
  private products: Product[];

  constructor(products: Product[] = PRODUCT_DATABASE) {
    this.products = products;
  }

  searchProducts(query: string, options: ProductSearchOptions = {}): Product[] {
    let filtered = this.products;

    // Фильтрация по параметрам
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

    // Поиск по тексту с улучшенной логикой
    if (query) {
      const searchTerms = query.toLowerCase().split(' ');
      filtered = filtered.filter((product) => {
        const searchText =
          `${product.name} ${product.description} ${product.tags.join(' ')} ${product.subcategory} ${product.category}`.toLowerCase();

        // Поиск с учетом синонимов и различных формулировок
        return searchTerms.some((term) => {
          // Прямое совпадение
          if (searchText.includes(term)) return true;

          // Обработка синонимов для нижнего белья
          if (
            (term.includes('трус') || term === 'белье') &&
            (product.category === 'underwear' || searchText.includes('трус'))
          ) {
            return true;
          }

          // Обработка синонимов для обуви
          if (
            (term.includes('туфл') ||
              term.includes('ботинк') ||
              term.includes('кроссов') ||
              term.includes('сапог') ||
              term === 'обувь') &&
            product.category === 'shoes'
          ) {
            return true;
          }

          return false;
        });
      });
    }

    return filtered;
  }

  getProduct(id: string): Product | undefined {
    return this.products.find((p) => p.id === id);
  }

  getProductsByCategory(category: string): Product[] {
    return this.products.filter((p) => p.category === category);
  }

  getComplementaryProducts(productId: string): Product[] {
    const product = this.getProduct(productId);
    if (!product) return [];

    // Расширенная логика подбора дополняющих товаров
    const complementary: Product[] = [];

    if (product.category === 'clothing') {
      // Для одежды предлагаем аксессуары, украшения и обувь
      complementary.push(
        ...this.products.filter(
          (p) =>
            (p.category === 'accessories' || p.category === 'jewelry' || p.category === 'shoes') &&
            (p.gender === product.gender || p.gender === 'unisex') &&
            p.inStock,
        ),
      );
    } else if (product.category === 'underwear') {
      // Для нижнего белья предлагаем одежду и аксессуары
      complementary.push(
        ...this.products.filter(
          (p) =>
            (p.category === 'clothing' || p.category === 'accessories') &&
            (p.gender === product.gender || p.gender === 'unisex') &&
            p.inStock,
        ),
      );
    } else if (product.category === 'shoes') {
      // Для обуви предлагаем одежду и аксессуары
      complementary.push(
        ...this.products.filter(
          (p) =>
            (p.category === 'clothing' || p.category === 'accessories') &&
            (p.gender === product.gender || p.gender === 'unisex') &&
            p.inStock,
        ),
      );
    } else if (product.category === 'accessories') {
      // Для аксессуаров предлагаем одежду и украшения того же стиля
      complementary.push(
        ...this.products.filter(
          (p) =>
            p.id !== productId &&
            (p.gender === product.gender || p.gender === 'unisex') &&
            p.inStock &&
            (p.tags.some((tag) => product.tags.includes(tag)) ||
              p.category === 'jewelry' ||
              p.category === 'clothing'),
        ),
      );
    } else if (product.category === 'jewelry') {
      // Для украшений предлагаем аксессуары и одежду
      complementary.push(
        ...this.products.filter(
          (p) =>
            (p.category === 'accessories' || p.category === 'clothing') &&
            (p.gender === product.gender || p.gender === 'unisex') &&
            p.inStock,
        ),
      );
    }

    return complementary.slice(0, 5); // Ограничиваем количество предложений
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

  // Метод для получения статистики по категориям
  getCategoryStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    this.products.forEach((product) => {
      stats[product.category] = (stats[product.category] || 0) + 1;
    });
    return stats;
  }

  // Метод для получения всех доступных категорий
  getAvailableCategories(): string[] {
    return [...new Set(this.products.map((p) => p.category))];
  }
}
