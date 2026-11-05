const API = '/api/v1/modules/finance';
export const FinanceService = {
    async createTransaction(data: { studentId?: string; type: string; amount: number; description: string; paymentMethod: string; mobileOperator?: string }) {
        const r = await fetch(`${API}/transaction`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('authToken')||''}` }, body: JSON.stringify(data)
        }); return r.json();
    },
    async getTransactions(filters?: { type?: string; period?: string }) {
        const q = new URLSearchParams(Object.entries(filters || {}).filter(([, v]) => v));
        const r = await fetch(`${API}/transactions?${q}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')||''}` } });
        return r.json();
    },
    async getReceipt(transId: string) {
        const r = await fetch(`${API}/receipt/${transId}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')||''}` } });
        return r.json();
    },
    async getSummary() {
        const r = await fetch(`${API}/summary`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')||''}` } });
        const d = await r.json(); return d.success ? d.summary : null;
    }
};