# KUMA Module — Petite Caisse & Reçus 🇨🇮

**Version 1.0.0 · API v1**

Gestion de la petite caisse avec encaissements, génération de reçus PDF, et paiements échelonnés.

## 📦 Installation
```bash
npx wrangler d1 execute <DB> --remote --file modules/finance-caisse/server/schema.sql
# Mount: app.route('/api/v1/modules/finance', createFinanceModule());
```

## 🔌 API v1
| Méthode | Route | Description |
|---|---|---|
| GET | `/health` | Probe capacité |
| POST | `/transaction` | Enregistrer paiement |
| GET | `/transactions` | Historique paiements |
| GET | `/receipt/:id` | Générer reçu PDF |
| POST | `/installment` | Paiement échelonné |
| GET | `/summary` | Résumé finances |

MIT — libre KSP.