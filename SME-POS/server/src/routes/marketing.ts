/** Marketing routes — port of MarketingController */
import { Hono } from 'hono';
import type { HonoVars } from '../lib/context.js';
export const marketingRoutes = new Hono<{ Variables: HonoVars }>();
marketingRoutes.get('/', (ctx) => ctx.json({ page: 'marketing', brand: process.env.BRAND_NAME ?? 'Wivae' }));
