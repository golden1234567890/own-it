// api/webhook.js — Vercel Serverless Function
// Reçoit les événements Stripe et déclenche la commande Gelato

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig    = req.headers['stripe-signature'];

  let event;
  try {
    // Vérifie la signature du webhook pour sécurité
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session  = event.data.object;
    const shipping = session.shipping_details?.address;
    const { productType, color, size, text } = session.metadata;

    console.log(`✅ Payment confirmed for ${productType} · ${color} · ${size}`);
    console.log(`📦 Shipping to: ${shipping?.city}, ${shipping?.country}`);

    // ── Déclenche la commande Gelato ──
    try {
      await placeGelatoOrder({
        orderId:    session.id,
        customerId: session.customer_email || session.id,
        productType,
        color,
        size,
        text,
        customerEmail: session.customer_email,
        shippingAddress: {
          firstName:    session.shipping_details?.name?.split(' ')[0] || '',
          lastName:     session.shipping_details?.name?.split(' ').slice(1).join(' ') || '',
          addressLine1: shipping?.line1 || '',
          addressLine2: shipping?.line2 || '',
          city:         shipping?.city  || '',
          state:        shipping?.state || '',
          postCode:     shipping?.postal_code || '',
          country:      shipping?.country || 'PT',
          email:        session.customer_email || '',
        }
      });
    } catch (err) {
      console.error('Gelato order error:', err);
      // Log l'erreur mais retourne 200 à Stripe pour éviter les retentatives
      // En production : ajouter à une queue de retry
    }
  }

  res.status(200).json({ received: true });
}

async function placeGelatoOrder({ orderId, customerId, productType, color, size, text, customerEmail, shippingAddress }) {
  const apiKey = process.env.GELATO_API_KEY;

  // Map couleurs Own It → codes couleur Gelato
  const COLOR_MAP = {
    tshirt: { white: 'white', grey: 'heather-grey', black: 'black' },
    hoodie: { white: 'white', grey: 'sport-grey',   black: 'black' },
    cap:    { white: 'white', grey: 'grey',          black: 'black' },
  };

  // Map types Own It → codes produit Gelato
  const TYPE_MAP = {
    tshirt: 't-shirt_gsc_crewneck',
    hoodie: 'hoodie_gsc_hooded',
    cap:    'cap_gsc_dad-hat',
  };

  const gelatoColor = COLOR_MAP[productType]?.[color] || color;
  const gelatoType  = TYPE_MAP[productType];
  const gelatoSize  = productType === 'cap' ? 'os' : size.toLowerCase();
  const printSides  = productType === 'cap' ? '1-0' : '4-4';

  const productUid = `apparel_product_gca_${gelatoType}_gcu_unisex_gqa_classic_gsi_${gelatoSize}_gco_${gelatoColor}_gpr_${printSides}`;

  // URL du fichier d'impression (à générer selon le design)
  // Pour l'instant : fichier de test Gelato
  // En production : générer le PNG 300 DPI depuis le design du client
  const printFileUrl = process.env.DEFAULT_PRINT_URL || 'https://cdn-origin.gelato-api-dashboard.ie.live.gelato.tech/docs/sample-print-files/logo.png';

  const body = {
    orderType:          'order',
    orderReferenceId:   orderId,
    customerReferenceId: customerId,
    currency:           'EUR',
    items: [{
      itemReferenceId: `item_${orderId}`,
      productUid,
      files: [{ type: 'default', url: printFileUrl }],
      quantity: 1,
    }],
    shipmentMethodUid:  'standard',
    shippingAddress,
  };

  const response = await fetch('https://order.gelatoapis.com/v4/orders', {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-KEY':    apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Gelato error ${response.status}: ${JSON.stringify(err)}`);
  }

  const result = await response.json();
  console.log(`🎽 Gelato order placed: ${result.id}`);
  return result;
}
