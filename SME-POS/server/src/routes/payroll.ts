/** Payroll routes — port of PayrollController */
import { Hono } from 'hono';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import type { HonoVars } from '../lib/context.js';
export const payrollRoutes = new Hono<{ Variables: HonoVars }>();

payrollRoutes.get('/', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  // Previously unguarded: every mutation on this router checked the role but
  // the read didn't — any authenticated non-admin (e.g. a waiter with a
  // dashboard login someday) could list every colleague's salary, PAYE, and
  // payslip history. Salary data is exactly the thing to gate hardest.
  if (!['owner', 'manager'].includes(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const runs = await db.payrollRun.findMany({ where: { tenantId: t.id }, include: { payslips: { include: { user: { select: { name: true } } } } }, orderBy: { periodMonth: 'desc' }, take: 12 });
  const staff = await db.user.findMany({ where: { tenantId: t.id, deletedAt: null }, select: { id: true, name: true, role: true, monthlySalaryCents: true } });
  return ctx.json({ runs, staff, nssaRateBps: t.nssaRateBps, nssaCeilingCents: t.nssaCeilingCents });
});

payrollRoutes.post('/run', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!['owner','manager'].includes(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const { periodMonth } = z.object({ periodMonth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(await ctx.req.json());
  const period = new Date(periodMonth);
  const existing = await db.payrollRun.findFirst({ where: { tenantId: t.id, periodMonth: period } });
  if (existing) return ctx.json({ message: 'Payroll already run for this month.' }, 422);
  const staff = await db.user.findMany({ where: { tenantId: t.id, deletedAt: null, monthlySalaryCents: { not: null } } });
  if (!staff.length) return ctx.json({ message: 'No staff with salary set.' }, 422);
  const runId = crypto.randomUUID();
  await db.payrollRun.create({ data: { id: runId, tenantId: t.id, periodMonth: period, runById: u.id } });
  // PAYE calculation (Zimbabwe 2024 brackets — from ZIMRA)
  for (const employee of staff) {
    const gross = employee.monthlySalaryCents!;
    const paye = calculatePAYE(gross);
    const aidsLevy = Math.round(paye * 0.03);
    const nssa = Math.min(Math.round(gross * t.nssaRateBps / 10000), t.nssaCeilingCents);
    const net = gross - paye - aidsLevy - nssa;
    await db.payslip.create({ data: { id: crypto.randomUUID(), tenantId: t.id, payrollRunId: runId, userId: employee.id, grossCents: gross, payeCents: paye, aidsLevyCents: aidsLevy, nssaCents: nssa, netCents: net } });
  }
  return ctx.json({ message: 'Payroll run complete.', runId }, 201);
});

payrollRoutes.patch('/staff/:userId/salary', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!['owner','manager'].includes(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const { monthlySalaryCents } = z.object({ monthlySalaryCents: z.number().int().min(0).nullable() }).parse(await ctx.req.json());
  await db.user.updateMany({ where: { id: ctx.req.param('userId'), tenantId: t.id }, data: { monthlySalaryCents: monthlySalaryCents ?? undefined } });
  return ctx.json({ message: 'Salary updated.' });
});

payrollRoutes.patch('/nssa', async (ctx) => {
  const u = ctx.get('user'); const t = ctx.get('tenant');
  if (!['owner'].includes(u.role)) return ctx.json({ message: 'Forbidden.' }, 403);
  const d = z.object({ nssaRateBps: z.number().int().min(0).max(1000), nssaCeilingCents: z.number().int().min(0) }).parse(await ctx.req.json());
  await db.tenant.update({ where: { id: t.id }, data: d });
  return ctx.json({ message: 'NSSA settings saved.' });
});

function calculatePAYE(grossCents: number): number {
  const gross = grossCents / 100; // convert to dollars for bracket math
  let paye = 0;
  // Zimbabwe 2024 PAYE brackets (confirmed from ZIMRA)
  if (gross <= 100) paye = 0;
  else if (gross <= 300) paye = (gross - 100) * 0.20;
  else if (gross <= 700) paye = 40 + (gross - 300) * 0.25;
  else if (gross <= 1500) paye = 140 + (gross - 700) * 0.30;
  else if (gross <= 3000) paye = 380 + (gross - 1500) * 0.35;
  else paye = 905 + (gross - 3000) * 0.40;
  return Math.round(paye * 100); // back to cents
}
