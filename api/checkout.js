// api/checkout.js — Vercel Serverless Function
// Crée une session Stripe Checkout et redirige le client vers la page de paiement
// Déploie automatiquement avec le site sur Vercel

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://own-it.studio');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  const {
    productType,  // 'tshirt' | 'hoodie' | 'cap'
    color,        // 'white' | 'grey' | 'black'
    size,         // 'XS' | 'S' | 'M' | 'L' | 'XL' | 'OS'
    text,         // texte custom (optionnel)
    customerEmail // email du client
  } = req.body;

  // Prix en centimes
  const PRICES = {
    tshirt: { XS: 2490, S: 2490, M: 2490, L: 2490, XL: 2490 },
    hoodie: { XS: 3990, S: 3990, M: 3990, L: 3990, XL: 3990 },
    cap:    { OS: 1990 }
  };

  const NAMES = {
    tshirt: 'Classic T-shirt',
    hoodie: 'Studio Hoodie',
    cap:    'Signature Cap'
  };

  const priceInCents = PRICES[productType]?.[size] || PRICES[productType]?.OS;
  if (!priceInCents) return res.status(400).json({ error: 'Invalid product or size' });

  const colorLabel = { white: 'White', grey: 'Grey', black: 'Black' }[color] || color;
  const sizeLabel  = size === 'OS' ? 'One size' : size;
  const productName = `${NAMES[productType]} · ${colorLabel} · ${sizeLabel}`;
  const description = text ? `Custom text: "${text}"` : 'Custom design — Made to order';

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: productName,
            description,
            images: ['https://own-it.studio/og-image.jpg'], // ajoute une image produit plus tard
          },
          unit_amount: priceInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: customerEmail || undefined,
      shipping_address_collection: {
        allowed_countries: ['PT','FR','ES','DE','IT','GB','NL','BE','AT','CH','BR','US','CA','AU'],
      },
      success_url: `https://own-it.studio/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `https://own-it.studio/studio.html`,
      metadata: {
        productType,
        color,
        size,
        text: text || '',
      },
      payment_intent_data: {
        description: `Own It — ${productName}`,
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
