import { describe, expect, it } from 'vitest';
import { browseProducts, searchProducts } from './productSearch';
import type { Category, Product } from '../types/contract';

const cats: Category[] = [
    { id: 'c-beef', name: 'Beef' },
    { id: 'c-chicken', name: 'Chicken' },
    { id: 'c-drinks', name: 'Drinks' },
];

function product(id: string, name: string, extra: Partial<Product> = {}): Product {
    return {
        id, name, category_id: null, sku: null, barcode: null, price_cents: 100, currency: 'USD',
        tax_class: 'standard', type: 'retail', track_stock: true, is_active: true, ...extra,
    };
}

const catalogue = [
    product('1', 'Beef Stewing (1kg)', { category_id: 'c-beef', sku: 'SKU-000001' }),
    product('2', 'T-bone Steak (1kg)', { category_id: 'c-beef', sku: 'SKU-000002' }),
    product('3', 'Whole Chicken', { category_id: 'c-chicken', sku: 'SKU-000003' }),
    product('4', 'Pork Chops (1kg)', { sku: 'SKU-000004' }),
    product('5', 'Coke 500ml', { category_id: 'c-drinks', barcode: '6001234567890' }),
    product('6', 'Retired Item', { is_active: false }),
];

const names = (r: Product[]) => r.map((p) => p.name);

describe('searchProducts', () => {
    it('finds products by a category, not just by their name', () => {
        // "Steak" never contains "beef" — only its category does.
        expect(names(searchProducts(catalogue, cats, 'beef'))).toEqual(['Beef Stewing (1kg)', 'T-bone Steak (1kg)']);
        expect(names(searchProducts(catalogue, cats, 'chicken'))).toEqual(['Whole Chicken']);
    });

    it('needs every word to match somewhere (name, category, sku, barcode)', () => {
        expect(names(searchProducts(catalogue, cats, 'beef 1kg'))).toEqual(['Beef Stewing (1kg)', 'T-bone Steak (1kg)']);
        expect(names(searchProducts(catalogue, cats, 'pork chops'))).toEqual(['Pork Chops (1kg)']);
        expect(searchProducts(catalogue, cats, 'beef chicken')).toEqual([]);
    });

    it('matches part of a SKU or barcode', () => {
        expect(names(searchProducts(catalogue, cats, 'SKU-000003'))).toEqual(['Whole Chicken']);
        expect(names(searchProducts(catalogue, cats, '600123'))).toEqual(['Coke 500ml']);
    });

    it('a full barcode (a scan) returns just that product', () => {
        expect(names(searchProducts(catalogue, cats, '6001234567890'))).toEqual(['Coke 500ml']);
    });

    it('ranks names that start with the search above matches found through the category', () => {
        const list = [
            product('a', 'Sausage', { category_id: 'c-beef' }), // only matches via category "Beef"
            product('b', 'Beef Mince'),                          // name starts with "beef"
            product('c', 'Corned Beef'),                         // name contains "beef"
        ];
        expect(names(searchProducts(list, cats, 'beef'))).toEqual(['Beef Mince', 'Corned Beef', 'Sausage']);
    });

    it('never lists retired products, ignores case and padding, and returns nothing for an empty search', () => {
        expect(searchProducts(catalogue, cats, 'retired')).toEqual([]);
        expect(names(searchProducts(catalogue, cats, '  WHOLE chicken '))).toEqual(['Whole Chicken']);
        expect(searchProducts(catalogue, cats, '   ')).toEqual([]);
    });

    it('lists more than 8 hits (it used to stop at 8)', () => {
        const many = Array.from({ length: 15 }, (_, i) => product(String(i), `Beef cut ${String(i).padStart(2, '0')}`));
        expect(searchProducts(many, cats, 'beef')).toHaveLength(15);
        expect(searchProducts(many, cats, 'beef', 5)).toHaveLength(5);
    });
});

describe('browseProducts', () => {
    it('lists the active catalogue A–Z, capped', () => {
        expect(names(browseProducts(catalogue))).toEqual([
            'Beef Stewing (1kg)', 'Coke 500ml', 'Pork Chops (1kg)', 'T-bone Steak (1kg)', 'Whole Chicken',
        ]);
        expect(browseProducts(catalogue, 2)).toHaveLength(2);
    });
});
