import { z } from 'zod';
import { EnhancedProductRAG } from '../rag/enhanced-product-rag.js';
import { type ProductSearchOptions } from '../rag/product-rag.js';

export class ProductFunctions {
  private productRAG: EnhancedProductRAG;

  constructor() {
    this.productRAG = new EnhancedProductRAG();
  }

  getFunctionContext() {
    return {
      searchProducts: {
        description:
          'Найти товары по запросу клиента. Используй эту функцию для поиска подходящих товаров в каталоге.',
        parameters: z.object({
          query: z
            .string()
            .describe('Поисковый запрос (название товара, описание, тип одежды, и т.д.)'),
          category: z
            .enum(['clothing', 'accessories', 'jewelry', 'shoes', 'underwear'])
            .optional()
            .describe('Категория товара'),
          gender: z
            .enum(['men', 'women', 'unisex'])
            .optional()
            .describe('Пол (мужской/женский/унисекс)'),
          minPrice: z.number().optional().describe('Минимальная цена'),
          maxPrice: z.number().optional().describe('Максимальная цена'),
          inStock: z.boolean().optional().describe('Только товары в наличии (по умолчанию true)'),
        }),
        execute: async ({
          query,
          category,
          gender,
          minPrice,
          maxPrice,
          inStock = true,
        }: {
          query: string;
          category?: 'clothing' | 'accessories' | 'jewelry' | 'shoes' | 'underwear';
          gender?: 'men' | 'women' | 'unisex';
          minPrice?: number;
          maxPrice?: number;
          inStock?: boolean;
        }) => {
          console.debug(`Поиск товаров: "${query}", категория: ${category}, пол: ${gender}`);

          const options: ProductSearchOptions = {
            category,
            gender,
            inStock,
          };

          if (minPrice !== undefined || maxPrice !== undefined) {
            options.priceRange = {
              min: minPrice ?? 0,
              max: maxPrice ?? Infinity,
            };
          }

          const products = this.productRAG.searchProducts(query, options);
          return this.productRAG.formatProductsForLLM(products);
        },
      },

      getProductDetails: {
        description: 'Получить подробную информацию о конкретном товаре по его ID',
        parameters: z.object({
          productId: z.string().describe('ID товара'),
        }),
        execute: async ({ productId }: { productId: string }) => {
          console.debug(`Получение деталей товара: ${productId}`);

          const product = this.productRAG.getProduct(productId);
          if (!product) {
            return 'Товар с указанным ID не найден.';
          }

          return this.productRAG.formatProductForLLM(product);
        },
      },

      getComplementaryProducts: {
        description:
          'Найти товары, которые хорошо дополняют указанный товар (для создания комплектов и увеличения среднего чека)',
        parameters: z.object({
          productId: z.string().describe('ID товара, для которого нужны дополнения'),
        }),
        execute: async ({ productId }: { productId: string }) => {
          console.debug(`Поиск дополняющих товаров для: ${productId}`);

          const complementary = this.productRAG.getComplementaryProducts(productId);
          if (complementary.length === 0) {
            return 'Дополняющие товары не найдены.';
          }

          return (
            `Товары, которые отлично дополнят ваш выбор:\n\n` +
            this.productRAG.formatProductsForLLM(complementary)
          );
        },
      },

      getProductsByCategory: {
        description: 'Получить все товары определенной категории',
        parameters: z.object({
          category: z
            .enum(['clothing', 'accessories', 'jewelry', 'shoes', 'underwear'])
            .describe('Категория товаров'),
          gender: z.enum(['men', 'women', 'unisex']).optional().describe('Фильтр по полу'),
          limit: z
            .number()
            .optional()
            .describe('Максимальное количество товаров для показа (по умолчанию 10)'),
        }),
        execute: async ({
          category,
          gender,
          limit = 10,
        }: {
          category: 'clothing' | 'accessories' | 'jewelry' | 'shoes' | 'underwear';
          gender?: 'men' | 'women' | 'unisex';
          limit?: number;
        }) => {
          console.debug(`Получение товаров категории: ${category}, пол: ${gender}`);

          let products = this.productRAG.getProductsByCategory(category);

          if (gender) {
            products = products.filter((p) => p.gender === gender || p.gender === 'unisex');
          }

          // Показываем только товары в наличии
          products = products.filter((p) => p.inStock);

          // Ограничиваем количество
          products = products.slice(0, limit);

          return this.productRAG.formatProductsForLLM(products);
        },
      },

      getCatalogSummary: {
        description: 'Получить краткий обзор всего каталога товаров с количеством по категориям',
        parameters: z.object({}),
        execute: async () => {
          console.debug('Получение обзора каталога');

          const stats = this.productRAG.getCategoryStats();
          const categories = this.productRAG.getAvailableCategories();

          const categoryNames: Record<string, string> = {
            clothing: 'Одежда',
            accessories: 'Аксессуары',
            jewelry: 'Ювелирные изделия',
            shoes: 'Обувь',
            underwear: 'Нижнее белье',
          };

          let summary = 'В нашем каталоге представлены следующие категории товаров:\n\n';

          categories.forEach((category) => {
            const count = stats[category] || 0;
            const displayName = categoryNames[category] || category;
            summary += `• ${displayName}: ${count} товаров\n`;
          });

          const totalProducts = Object.values(stats).reduce((sum, count) => sum + count, 0);
          summary += `\nВсего товаров в каталоге: ${totalProducts}`;

          return summary;
        },
      },
    };
  }
}
