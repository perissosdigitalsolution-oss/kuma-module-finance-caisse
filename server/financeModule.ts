// ============================================================================
// KUMA Module: Petite Caisse & Reçus — Hono sub-app (mountable, self-contained).
//
// Embedded mode (host worker):
//   import { createFinanceModule } from '../../modules/finance-caisse/server/financeModule';
//   app.route('/api/v1/modules/finance', createFinanceModule());
//
// Standalone mode: server/standalone/index.ts mounts the SAME factory.
// External dependencies: hono (peer), pdf-lib (peer — receipts only).
// ============================================================================
import { Hono, type Context } from 'hono';

const FINANCE_ROLES = new Set([
    'admin', 'director', 'directeur', 'directrice', 'founder', 'fondatrice',
    'manager', 'gestionnaire', 'accountant', 'comptable',
]);

/** Minimal D1 surface used by the module (works with Cloudflare D1). */
export interface ModuleDB {
    prepare(sql: string): {
        bind(...vals: unknown[]): {
            first<T = Record<string, unknown>>(): Promise<T | null>;
            all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
            run(): Promise<unknown>;
        };
        first<T = Record<string, unknown>>(): Promise<T | null>;
        all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
    };
    batch(stmts: unknown[]): Promise<unknown>;
}

interface ModPayload { sub?: string; role?: string; schoolId?: string; tenantId?: string; email?: string; name?: string }

export type ModEnv = {
    Bindings: { DB: ModuleDB; [k: string]: unknown };
    Variables: { tenantId: string; jwtPayload: ModPayload | null };
};

type ModContext = Context<ModEnv>;

function resolveContext(c: ModContext): { tenantId: string; role: string; userId: string } {
    const payload = (c.get('jwtPayload') || {}) as ModPayload;
    const tenantId = String(c.get('tenantId') || payload.schoolId || payload.tenantId || 'default');
    return { tenantId, role: String(payload.role || '').toLowerCase(), userId: String(payload.sub || '') };
}

function genId(prefix: string): string {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

const TX_TYPES = ['tranche', 'examen', 'activite', 'cotisation', 'remboursement'] as const;
const PAY_METHODS = ['mobile', 'espece', 'cheque', 'virement'] as const;

export function createFinanceModule() {
    const app = new Hono<ModEnv>();

    // ── GET /v1/health — unauthenticated capability probe ───────────────────
    app.get('/v1/health', (c: ModContext) => c.json({
        module: 'kuma-module-finance-caisse',
        version: '1.0.0',
        status: 'ready',
        capabilities: ['transactions', 'receipts-pdf', 'installments', 'summary'],
        time: new Date().toISOString(),
    }));

    // ── POST /v1/transaction — record a payment (finance roles) ─────────────
    app.post('/v1/transaction', async (c: ModContext) => {
        try {
            const { tenantId, role, userId } = resolveContext(c);
            if (!FINANCE_ROLES.has(role)) return c.json({ error: 'Forbidden' }, 403);

            const body = await c.req.json<{
                studentId?: string; type: string; amount: number; description: string;
                paymentMethod?: string; mobileOperator?: string; period?: string; dueDate?: string;
            }>();
            if (!TX_TYPES.includes(body.type as typeof TX_TYPES[number]) || !body.amount || body.amount <= 0 || !body.description) {
                return c.json({ error: 'type (tranche|examen|activite|cotisation|remboursement), positive amount and description are required' }, 400);
            }
            if (body.paymentMethod && !PAY_METHODS.includes(body.paymentMethod as typeof PAY_METHODS[number])) {
                return c.json({ error: 'paymentMethod must be mobile|espece|cheque|virement' }, 400);
            }

            const transId = genId('fin');
            await c.env.DB.prepare(`
                INSERT INTO mod_finance_transactions
                    (id, school_id, student_id, type, amount, description, payment_method, mobile_operator, transaction_ref, period, due_date, created_by, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                transId, tenantId, body.studentId || null, body.type, body.amount, body.description,
                body.paymentMethod || 'mobile', body.mobileOperator || null, transId,
                body.period || null, body.dueDate || null, userId, new Date().toISOString()
            ).run();

            return c.json({ success: true, transactionId: transId, reference: transId }, 201);
        } catch (e) {
            console.error('[finance-module] transaction error:', e);
            return c.json({ error: 'Failed to record transaction' }, 500);
        }
    });

    // ── GET /v1/transactions?type=&period=&student=&limit= ──────────────────
    app.get('/v1/transactions', async (c: ModContext) => {
        try {
            const { tenantId } = resolveContext(c);
            const type = c.req.query('type');
            const period = c.req.query('period');
            const student = c.req.query('student');
            const limit = Math.max(1, Math.min(200, Number(c.req.query('limit') || '50')));

            let sql = 'SELECT * FROM mod_finance_transactions WHERE school_id = ?';
            const binds: unknown[] = [tenantId];
            if (type) { sql += ' AND type = ?'; binds.push(type); }
            if (period) { sql += ' AND period = ?'; binds.push(period); }
            if (student) { sql += ' AND student_id = ?'; binds.push(student); }
            sql += ' ORDER BY created_at DESC LIMIT ?';
            binds.push(limit);

            const { results } = await c.env.DB.prepare(sql).bind(...binds).all();
            return c.json({ success: true, transactions: results || [] });
        } catch (e) {
            console.error('[finance-module] transactions error:', e);
            return c.json({ error: 'Failed to fetch transactions' }, 500);
        }
    });

    // ── GET /v1/receipt/:transactionId — generate + persist a receipt ───────
    app.get('/v1/receipt/:transactionId', async (c: ModContext) => {
        try {
            const { tenantId, role } = resolveContext(c);
            if (!FINANCE_ROLES.has(role)) return c.json({ error: 'Forbidden' }, 403);

            const transId = c.req.param('transactionId');
            const trans = await c.env.DB.prepare(`
                SELECT * FROM mod_finance_transactions WHERE id = ? AND school_id = ?
            `).bind(transId, tenantId).first<Record<string, unknown>>();
            if (!trans) return c.json({ error: 'Transaction not found' }, 404);

            // Import lazily so the module stays light on routes that never print.
            const { PDFDocument, StandardFonts } = await import('pdf-lib');
            const doc = await PDFDocument.create();
            const page = doc.addPage([595, 842]); // A4
            const font = await doc.embedFont(StandardFonts.Helvetica);
            const amount = Number(trans.amount ?? 0);

            const lines = [
                'KUMA SCHOOL — RECU DE PAIEMENT',
                '------------------------------',
                `Recu: ${genId('REC').toUpperCase()}`,
                `Date: ${new Date().toISOString().slice(0, 10)}`,
                `Transaction: ${String(trans.id)}`,
                `Type: ${String(trans.type)}`,
                `Description: ${String(trans.description ?? '')}`,
                `Montant: ${amount.toLocaleString('fr-FR')} FCFA`,
                `Methode: ${String(trans.payment_method ?? '')}`,
                `Periode: ${String(trans.period ?? '-')}`,
                '------------------------------',
                'Document genere automatiquement — KUMA Module Finance',
            ];
            lines.forEach((line, i) => {
                page.drawText(line, { x: 50, y: 780 - i * 24, size: 11, font });
            });

            const pdfBytes = await doc.save();
            const base64 = btoa(String.fromCharCode(...pdfBytes));

            const receiptId = genId('rec');
            await c.env.DB.prepare(`
                INSERT INTO mod_finance_receipts (id, transaction_id, receipt_number, school_name, recipient_name, amount, description, payment_method, transaction_ref, generated_at, validated_by)
                VALUES (?, ?, ?, 'KUMA School', ?, ?, ?, ?, ?, ?, ?)
            `).bind(
                receiptId, transId, receiptId.toUpperCase(), String(trans.student_id ?? 'Parent'),
                amount, String(trans.description ?? ''), String(trans.payment_method ?? ''),
                String(trans.transaction_ref ?? transId), new Date().toISOString(), resolveContext(c).userId
            ).run();

            await c.env.DB.prepare('UPDATE mod_finance_transactions SET receipt_generated = 1 WHERE id = ?')
                .bind(transId).run();

            return c.json({ success: true, receiptId, pdfBase64: base64, mimeType: 'application/pdf' });
        } catch (e) {
            console.error('[finance-module] receipt error:', e);
            return c.json({ error: 'Failed to generate receipt' }, 500);
        }
    });

    // ── POST /v1/installment — pay against a defined period (finance roles) ─
    app.post('/v1/installment', async (c: ModContext) => {
        try {
            const { tenantId, role, userId } = resolveContext(c);
            if (!FINANCE_ROLES.has(role)) return c.json({ error: 'Forbidden' }, 403);

            const body = await c.req.json<{ studentId: string; periodId: string; amount: number; paymentMethod?: string }>();
            if (!body.studentId || !body.periodId || !body.amount || body.amount <= 0) {
                return c.json({ error: 'studentId, periodId and a positive amount are required' }, 400);
            }

            const period = await c.env.DB.prepare('SELECT * FROM mod_finance_periods WHERE id = ? AND school_id = ?')
                .bind(body.periodId, tenantId).first<Record<string, unknown>>();
            if (!period) return c.json({ error: 'Period not found' }, 404);

            const transId = genId('inst');
            await c.env.DB.prepare(`
                INSERT INTO mod_finance_transactions (id, school_id, student_id, type, amount, description, payment_method, period, created_by, created_at)
                VALUES (?, ?, ?, 'tranche', ?, ?, ?, ?, ?, ?)
            `).bind(
                transId, tenantId, body.studentId, body.amount,
                `Tranche ${String(period.label ?? '')}`, body.paymentMethod || 'mobile',
                String(period.label ?? ''), userId, new Date().toISOString()
            ).run();

            return c.json({ success: true, transactionId: transId }, 201);
        } catch (e) {
            console.error('[finance-module] installment error:', e);
            return c.json({ error: 'Failed to record installment' }, 500);
        }
    });

    // ── GET /v1/summary — real aggregates over this school's transactions ───
    app.get('/v1/summary', async (c: ModContext) => {
        try {
            const { tenantId } = resolveContext(c);
            const stats = await c.env.DB.prepare(`
                SELECT
                    SUM(CASE WHEN type != 'remboursement' THEN amount ELSE -amount END) AS total_net,
                    COUNT(*) AS total_transactions,
                    COUNT(DISTINCT student_id) AS students_payers,
                    SUM(CASE WHEN receipt_generated = 1 THEN 1 ELSE 0 END) AS receipts_generated
                FROM mod_finance_transactions WHERE school_id = ?
            `).bind(tenantId).first<Record<string, number | null>>();

            return c.json({
                success: true,
                summary: {
                    totalNet: Number(stats?.total_net ?? 0),
                    totalTransactions: Number(stats?.total_transactions ?? 0),
                    studentsPayers: Number(stats?.students_payers ?? 0),
                    receiptsGenerated: Number(stats?.receipts_generated ?? 0),
                },
            });
        } catch (e) {
            console.error('[finance-module] summary error:', e);
            return c.json({ error: 'Failed to fetch summary' }, 500);
        }
    });

    return app;
}