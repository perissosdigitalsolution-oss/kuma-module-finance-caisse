import React from 'react';
import { FinanceService } from './finance.service';

export default function CaisseManager({ lang = 'fr' }) {
    const [loading, setLoading] = React.useState(false);
    const [message, setMessage] = React.useState(null);
    const [summary, setSummary] = React.useState(null);

    React.useEffect(() => { FinanceService.getSummary().then(setSummary).catch(() => {}); }, []);

    const handlePayment = async () => {
        const amount = Number(prompt(lang === 'fr' ? 'Montant (FCFA):' : 'Amount (FCFA):'));
        if (!amount || amount <= 0) return;
        setLoading(true);
        try {
            const res = await FinanceService.createTransaction({ type: 'tranche', amount, description: 'Paiement école', paymentMethod: 'mobile' });
            setMessage(res.success ? (lang === 'fr' ? 'Paiement enregistré' : 'Payment recorded') : 'Erreur');
            setSummary({ total_encaisse: (summary?.total_encaisse || 0) + amount });
        } catch(e) { setMessage(lang === 'fr' ? 'Erreur' : 'Error'); }
        setLoading(false);
    };

    return (
        <div className="p-6 bg-white rounded-lg shadow">
            <h2 className="text-xl font-bold mb-4">{lang === 'fr' ? 'Petite Caisse' : 'Cash Desk'}</h2>
            {message && <div className="mb-4 p-3 rounded bg-blue-50">{message}</div>}
            {loading ? <p>{lang === 'fr' ? 'Enregistrement...' : 'Processing...'}</p> :
             <div className="grid gap-3 mb-4">
                <div className="p-3 bg-green-100 rounded"><div className="font-bold">{summary?.total_encaisse?.toLocaleString()} FCFA</div><div className="text-xs">{lang === 'fr' ? 'Total encaissé' : 'Total Collected'}</div></div>
                <div className="p-3 bg-blue-100 rounded"><div className="font-bold">{summary?.total_transactions || 0}</div><div className="text-xs">{lang === 'fr' ? 'Transactions' : 'Transactions'}</div></div>
             </div>}
            <button onClick={handlePayment} className="px-4 py-2 bg-orange-600 text-white rounded">
                {lang === 'fr' ? 'Encaisser' : 'Collect'}
            </button>
        </div>
    );
}