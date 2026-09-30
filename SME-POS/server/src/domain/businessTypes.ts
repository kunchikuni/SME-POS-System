/**
 * The kinds of business Wivae is set up for — one catalogue that sign-up,
 * the "Get selling" starter products and the suggested product categories
 * all read from.
 *
 * `tillMode` is which till a branch opens to (retail / restaurant /
 * hardware / workshop — branches.mode). Several business types share a till:
 * a pharmacy, bottle store or salon sells over a counter, so they use the
 * retail till with their own categories and starter products. Adding a
 * business type is data, not a new till.
 *
 * The business type itself is stored on `tenants.mode` (a column the
 * per-branch mode made otherwise unused). Tenants created before business
 * types existed hold a till mode there, which is also a valid key below.
 */

export type TillMode = 'retail' | 'restaurant' | 'hardware' | 'workshop';

/** An example product: prices in USD cents; qty = opening stock, null = not stock-tracked (a service, a cooked dish). */
export type Starter = { name: string; category: string; priceCents: number; qty: number | null };

export interface BusinessType {
  key: string;
  label: string;
  icon: string;
  hint: string;
  tillMode: TillMode;
  /** Suggested product categories, in display order. */
  categories: string[];
  starters: Starter[];
}

export const BUSINESS_TYPES: BusinessType[] = [
  {
    key: 'retail', label: 'Shop', icon: '🛍', hint: 'Tuckshop, general dealer', tillMode: 'retail',
    categories: ['Groceries', 'Drinks', 'Snacks & sweets', 'Toiletries', 'Household', 'Airtime & data'],
    starters: [
      { name: 'Bread (loaf)', category: 'Groceries', priceCents: 100, qty: 30 },
      { name: 'Cooking Oil 2L', category: 'Groceries', priceCents: 380, qty: 20 },
      { name: 'Sugar 2kg', category: 'Groceries', priceCents: 250, qty: 20 },
      { name: 'Mealie Meal 10kg', category: 'Groceries', priceCents: 700, qty: 15 },
      { name: 'Rice 2kg', category: 'Groceries', priceCents: 220, qty: 20 },
      { name: 'Coke 500ml', category: 'Drinks', priceCents: 80, qty: 48 },
      { name: 'Milk 1L', category: 'Drinks', priceCents: 110, qty: 24 },
      { name: 'Bath Soap', category: 'Toiletries', priceCents: 60, qty: 40 },
    ],
  },
  {
    key: 'supermarket', label: 'Supermarket', icon: '🛒', hint: 'Full grocery range', tillMode: 'retail',
    categories: ['Groceries', 'Fresh produce', 'Meat & poultry', 'Dairy & eggs', 'Bakery', 'Beverages', 'Snacks & sweets', 'Household & cleaning', 'Personal care', 'Baby'],
    starters: [
      { name: 'Mealie Meal 10kg', category: 'Groceries', priceCents: 700, qty: 30 },
      { name: 'Cooking Oil 2L', category: 'Groceries', priceCents: 380, qty: 30 },
      { name: 'Tomatoes (1kg)', category: 'Fresh produce', priceCents: 150, qty: 40 },
      { name: 'Chicken Portions 2kg', category: 'Meat & poultry', priceCents: 850, qty: 20 },
      { name: 'Eggs (tray of 30)', category: 'Dairy & eggs', priceCents: 450, qty: 20 },
      { name: 'White Bread', category: 'Bakery', priceCents: 100, qty: 40 },
      { name: 'Orange Juice 2L', category: 'Beverages', priceCents: 280, qty: 24 },
      { name: 'Dishwashing Liquid 750ml', category: 'Household & cleaning', priceCents: 200, qty: 24 },
    ],
  },
  {
    key: 'restaurant', label: 'Restaurant', icon: '🍽', hint: 'Tables & kitchen', tillMode: 'restaurant',
    categories: ['Starters', 'Mains', 'Sides', 'Desserts', 'Cold drinks', 'Hot drinks'],
    starters: [
      { name: 'Sadza & Beef Stew', category: 'Mains', priceCents: 500, qty: null },
      { name: 'Chicken & Chips', category: 'Mains', priceCents: 600, qty: null },
      { name: 'Beef Burger', category: 'Mains', priceCents: 550, qty: null },
      { name: 'Garden Salad', category: 'Sides', priceCents: 300, qty: null },
      { name: 'Coke 330ml', category: 'Cold drinks', priceCents: 100, qty: 48 },
      { name: 'Water 500ml', category: 'Cold drinks', priceCents: 80, qty: 48 },
      { name: 'Tea', category: 'Hot drinks', priceCents: 100, qty: null },
      { name: 'Coffee', category: 'Hot drinks', priceCents: 150, qty: null },
    ],
  },
  {
    key: 'bottlestore', label: 'Bottle store', icon: '🍺', hint: 'Beer, wines & spirits', tillMode: 'retail',
    categories: ['Beer', 'Ciders', 'Spirits', 'Wine', 'Soft drinks', 'Mixers', 'Snacks', 'Ice'],
    starters: [
      { name: 'Castle Lager 375ml', category: 'Beer', priceCents: 100, qty: 96 },
      { name: 'Zambezi Lager 375ml', category: 'Beer', priceCents: 100, qty: 96 },
      { name: 'Savanna Dry 330ml', category: 'Ciders', priceCents: 150, qty: 48 },
      { name: 'Gin 750ml', category: 'Spirits', priceCents: 1200, qty: 12 },
      { name: 'Red Wine 750ml', category: 'Wine', priceCents: 800, qty: 12 },
      { name: 'Coke 2L', category: 'Soft drinks', priceCents: 200, qty: 24 },
      { name: 'Tonic Water 200ml', category: 'Mixers', priceCents: 80, qty: 24 },
      { name: 'Ice (2kg bag)', category: 'Ice', priceCents: 100, qty: 20 },
    ],
  },
  {
    key: 'pharmacy', label: 'Pharmacy', icon: '💊', hint: 'Medicines & personal care', tillMode: 'retail',
    categories: ['Pain & fever', 'Cold & flu', 'Stomach & digestion', 'Vitamins & supplements', 'First aid', 'Baby care', 'Personal care', 'Prescription'],
    starters: [
      { name: 'Paracetamol 500mg (24)', category: 'Pain & fever', priceCents: 150, qty: 50 },
      { name: 'Ibuprofen 200mg (24)', category: 'Pain & fever', priceCents: 200, qty: 40 },
      { name: 'Cough Syrup 100ml', category: 'Cold & flu', priceCents: 350, qty: 20 },
      { name: 'Oral Rehydration Salts', category: 'Stomach & digestion', priceCents: 100, qty: 40 },
      { name: 'Vitamin C 1000mg (30)', category: 'Vitamins & supplements', priceCents: 500, qty: 20 },
      { name: 'Plasters (20)', category: 'First aid', priceCents: 150, qty: 30 },
      { name: 'Baby Wipes (80)', category: 'Baby care', priceCents: 250, qty: 24 },
      { name: 'Hand Sanitiser 500ml', category: 'Personal care', priceCents: 300, qty: 24 },
    ],
  },
  {
    key: 'clothing', label: 'Clothing', icon: '👕', hint: 'Clothes, shoes, uniforms', tillMode: 'retail',
    categories: ['Men', 'Women', 'Children', 'Shoes', 'School uniforms', 'Accessories'],
    starters: [
      { name: "Men's T-shirt", category: 'Men', priceCents: 800, qty: 30 },
      { name: "Men's Jeans", category: 'Men', priceCents: 2500, qty: 15 },
      { name: "Women's Dress", category: 'Women', priceCents: 2000, qty: 15 },
      { name: "Women's Blouse", category: 'Women', priceCents: 1200, qty: 20 },
      { name: "Kids' Tracksuit", category: 'Children', priceCents: 1500, qty: 15 },
      { name: 'Sneakers', category: 'Shoes', priceCents: 3000, qty: 12 },
      { name: 'School Shirt', category: 'School uniforms', priceCents: 700, qty: 40 },
      { name: 'Leather Belt', category: 'Accessories', priceCents: 600, qty: 20 },
    ],
  },
  {
    key: 'butchery', label: 'Butchery', icon: '🥩', hint: 'Meat by the kg', tillMode: 'retail',
    categories: ['Beef', 'Chicken', 'Pork', 'Goat', 'Sausages & wors', 'Offal', 'Spices & sauces'],
    starters: [
      { name: 'Beef Stewing (1kg)', category: 'Beef', priceCents: 700, qty: 40 },
      { name: 'T-bone Steak (1kg)', category: 'Beef', priceCents: 1000, qty: 20 },
      { name: 'Whole Chicken', category: 'Chicken', priceCents: 700, qty: 30 },
      { name: 'Pork Chops (1kg)', category: 'Pork', priceCents: 800, qty: 20 },
      { name: 'Goat Meat (1kg)', category: 'Goat', priceCents: 900, qty: 15 },
      { name: 'Boerewors (1kg)', category: 'Sausages & wors', priceCents: 750, qty: 25 },
      { name: 'Tripe (1kg)', category: 'Offal', priceCents: 400, qty: 15 },
      { name: 'Braai Spice 200g', category: 'Spices & sauces', priceCents: 200, qty: 30 },
    ],
  },
  {
    key: 'hardware', label: 'Hardware', icon: '🔧', hint: 'Parts & job refs', tillMode: 'hardware',
    categories: ['Building', 'Plumbing', 'Electrical', 'Paint', 'Tools', 'Fasteners', 'Security', 'Garden'],
    starters: [
      { name: 'Cement 50kg', category: 'Building', priceCents: 1200, qty: 40 },
      { name: 'Wire Nails 1kg', category: 'Fasteners', priceCents: 250, qty: 30 },
      { name: 'PVA Paint 5L', category: 'Paint', priceCents: 1800, qty: 12 },
      { name: 'PVC Pipe 50mm (6m)', category: 'Plumbing', priceCents: 900, qty: 20 },
      { name: 'Padlock 50mm', category: 'Security', priceCents: 500, qty: 15 },
      { name: 'Claw Hammer', category: 'Tools', priceCents: 800, qty: 10 },
      { name: 'Wheelbarrow', category: 'Tools', priceCents: 4500, qty: 5 },
      { name: 'Electrical Cable 2.5mm (per m)', category: 'Electrical', priceCents: 80, qty: 200 },
    ],
  },
  {
    key: 'workshop', label: 'Workshop', icon: '🚗', hint: 'Repairs, services & parts', tillMode: 'workshop',
    categories: ['Services', 'Parts', 'Oils & fluids', 'Tyres', 'Batteries', 'Accessories'],
    starters: [
      { name: 'Labour (1 hour)', category: 'Services', priceCents: 1500, qty: null },
      { name: 'Oil Change Service', category: 'Services', priceCents: 2500, qty: null },
      { name: 'Wheel Balancing', category: 'Services', priceCents: 800, qty: null },
      { name: 'Diagnostics', category: 'Services', priceCents: 1000, qty: null },
      { name: 'Engine Oil 5L', category: 'Oils & fluids', priceCents: 2200, qty: 12 },
      { name: 'Oil Filter', category: 'Parts', priceCents: 600, qty: 20 },
      { name: 'Brake Pads (set)', category: 'Parts', priceCents: 1800, qty: 10 },
      { name: 'Spark Plug', category: 'Parts', priceCents: 300, qty: 40 },
    ],
  },
  {
    key: 'salon', label: 'Salon & barber', icon: '💇', hint: 'Services & beauty products', tillMode: 'retail',
    categories: ['Haircuts', 'Braids & styling', 'Treatments', 'Nails', 'Hair products', 'Beauty products'],
    starters: [
      { name: "Men's Haircut", category: 'Haircuts', priceCents: 300, qty: null },
      { name: "Kids' Haircut", category: 'Haircuts', priceCents: 200, qty: null },
      { name: 'Box Braids', category: 'Braids & styling', priceCents: 2500, qty: null },
      { name: 'Wash & Blow-dry', category: 'Treatments', priceCents: 800, qty: null },
      { name: 'Relaxer Treatment', category: 'Treatments', priceCents: 1500, qty: null },
      { name: 'Manicure', category: 'Nails', priceCents: 700, qty: null },
      { name: 'Hair Food 250ml', category: 'Hair products', priceCents: 300, qty: 20 },
      { name: 'Body Lotion 400ml', category: 'Beauty products', priceCents: 400, qty: 20 },
    ],
  },
];

export const BUSINESS_TYPE_KEYS = BUSINESS_TYPES.map((b) => b.key) as [string, ...string[]];

/** What to call a branch when it isn't running its business's main type. */
const TILL_MODE_KIND: Record<string, { label: string; icon: string }> = {
  retail: { label: 'Shop', icon: '🛍' },
  restaurant: { label: 'Restaurant', icon: '🍽' },
  hardware: { label: 'Hardware', icon: '🔧' },
  workshop: { label: 'Workshop', icon: '🚗' },
};

const BY_KEY = new Map(BUSINESS_TYPES.map((b) => [b.key, b]));

/**
 * The business type for a tenant: its stored type (tenants.mode), else one
 * matching its default branch's till mode (tenants created before business
 * types existed), else Shop.
 */
export function businessTypeFor(stored: string | null | undefined, branchMode?: string | null): BusinessType {
  return BY_KEY.get(stored ?? '') ?? BY_KEY.get(branchMode ?? '') ?? BUSINESS_TYPES[0];
}

/**
 * The label + icon to show for ONE branch: "Butchery" for a butchery's
 * branches, not just "Retail" (the till mode several business types share).
 *
 * A branch only takes the business type's name while it runs that type's
 * till: a pharmacy that opens a restaurant branch shows "Restaurant" for that
 * branch, not "Pharmacy".
 */
export function branchKind(tenantMode: string | null | undefined, branchMode: string): { label: string; icon: string } {
  const type = businessTypeFor(tenantMode, branchMode);
  if (type.tillMode === branchMode) return { label: type.label, icon: type.icon };
  return TILL_MODE_KIND[branchMode] ?? TILL_MODE_KIND.retail;
}
