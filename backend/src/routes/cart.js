const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { upsertCart, getCart } = require('../db');
const productService = require('../../productService');
const { pool: pgdb } = require('../db');
const { publish, publishShoppingCart } = require('../events/pubsubPublisher');

// GET /api/cart/:userId -> get specific cart by ID
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const cart = await getCart(userId);

    if (!cart) {
      return res.status(404).json({ error: 'Cart not found' });
    }

    return res.status(200).json(cart);

  } catch (error) {
    console.error('Error fetching cart:', error);
    return res.status(500).json({ error: 'Failed to fetch cart' });
  }
});

// POST /api/cart -> create or update cart
router.post('/', async (req, res) => {
  const { userId, items } = req.body;
  
  // Validation
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'items array is required and must not be empty'
    });
  }

  // Validate each item
  for (const item of items) {
    if (!item.itemId || !item.quantity || item.quantity < 1) {
      return res.status(400).json({
        error: 'Each item must have itemId and quantity >= 1'
      });
    }
  }

  try {
    // Upsert to database
    await upsertCart({
      userId,
      items,
      currency: req.body.currency || 'EUR'
    });

    // Fetch updated cart
    const cart = await getCart(userId);

    // Publish cart snapshot to PubSub (non-blocking)
    publishShoppingCartWrapper(cart).catch(err =>
      console.error('Failed to publish cart event:', err)
    );

    // Return cart snapshot
    return res.status(200).json(cart);

  } catch (error) {
    console.error('Error upserting cart:', error);
    return res.status(500).json({ error: 'Failed to save cart' });
  }
});

// Helper function to publish cart events to PubSub using ShoppingCartWrapper
async function publishShoppingCartWrapper(cart) {
  try {
    // Format cart data to match ShoppingCartWrapper protobuf schema
    const wrapper = {
      userId: cart.userId,
      items: cart.items.map(item => ({
        itemId: item.itemId,
        sku: item.sku || '',
        name: item.name || '',
        priceCents: parseInt(item.priceCents) || 0,
        quantity: item.quantity || 0
      })),
      totalPriceCents: parseInt(cart.totalPriceCents) || 0,
      currency: cart.currency || 'EUR',
      updatedAt: cart.updatedAt || new Date().toISOString()
    };

    const messageId = await publishShoppingCart(wrapper);
    console.log(`[cart] Published ShoppingCartWrapper: ${messageId}`);
    return messageId;

  } catch (error) {
    console.error('[cart] Failed to publish ShoppingCartWrapper:', error);
    throw error;
  }
}


// POST /api/cart/:userId -> add an item
router.post('/:userId', async (req, res) => {
  const { userId } = req.params;
  const { itemId, sku, name, priceCents, quantity, metadata } = req.body;
  if (!Number.isInteger(quantity) || quantity < 1) return res.status(400).json({ error: 'Invalid quantity' });

  try {
    await pgdb.query(`INSERT INTO CartItem (userId, itemId, sku, name, priceCents, quantity)
                      VALUES ($1, $2, $3, $4, $5, $6)`,
                      [userId, itemId, sku, name, priceCents, quantity]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in cart PUT:', err);
    return res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// PUT /api/cart/:userId/:itemId -> update quantity
router.put('/:userId/:itemId', async (req, res) => {
  const { userId, itemId } = req.params;
  const { quantity } = req.body;
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'Invalid quantity' });
  if (quantity === 0) {
    const userId = itemId;
    await pgdb.query('DELETE FROM CartItem WHERE userId = $1 AND itemId = $2', [userId, itemId]);
    return res.json({ success: true });
  }

  try {
    await pgdb.query('UPDATE CartItem SET quantity = $1 WHERE userId = $2 AND itemId = $3', [quantity, userId, itemId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in cart PUT:', err);
    return res.status(500).json({ error: 'Failed to update cart item' });
  }
});

// DELETE /api/cart/:userId/:itemId -> Delete an item
router.delete('/:userId/:itemId', async (req, res) => {
  const { userId, itemId } = req.params;
  try {
    await pgdb.query('DELETE FROM CartItem WHERE userId = $1 AND itemId = $2', [userId, itemId]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Error in cart DELETE:', err);
    return res.status(500).json({ error: 'Failed to remove cart item' });
  }
});

// POST /api/cart/checkout
router.post('/checkout', async (req, res) => {
  const { address, cartId } = req.body;

  if (!address || !address.line1) {
    return res.status(400).json({
      error: 'Invalid address',
      actionable: 'Provide a valid shipping address'
    });
  }

  if (!cartId) {
    return res.status(400).json({
      error: 'cartId is required',
      actionable: 'Provide a cartId to checkout'
    });
  }

  try {
    // Get the full cart details
    const cart = await getCart(cartId);

    if (!cart) {
      return res.status(404).json({
        error: 'Cart not found',
        actionable: 'Provide a valid cartId'
      });
    }

    if (!cart.items || cart.items.length === 0) {
      return res.status(400).json({
        error: 'Empty cart',
        actionable: 'Add items to cart before checkout'
      });
    }

    // Validate products exist and stock is available
    let products;
    try {
      products = await productService.getProducts();
    } catch (e) {
      products = null;
    }

    if (!products) {
      return res.status(503).json({
        error: 'Product service unavailable',
        actionable: 'Try again later'
      });
    }

    const missing = cart.items.map(item => item.itemId)
      .filter(itemId => !products.some(p => p.id === itemId));

    if (missing.length > 0) {
      return res.status(400).json({
        error: 'Some cart items are not available in product service',
        missing
      });
    }

    const cartWithProducts = cart.items.map(cartItem => {
      const product = products.find(p => p.id === cartItem.itemId);
      return {
        itemId: cartItem.itemId,
        quantity: cartItem.quantity,
        name: cartItem.name || (product ? product.name : 'Unknown Product'),
        stock: product ? product.stock : 0
      };
    });
    /*
     const problems = cartWithProducts
       .filter(r => r.quantity > r.stock)
       .map(r => ({
         itemId: r.id,
         name: r.name,
         requested: r.quantity,
         available: r.stock,
         actionable: `Reduce quantity to ${r.stock} or remove item`
       }));
 
     if (problems.length > 0) {
       return res.status(409).json({
         error: 'Stock issues',
         details: problems
       });
     }
  */
    // Publish CHECKOUT_ATTEMPT event
    const checkoutAttemptEvent = {
      eventId: crypto.randomUUID(),
      eventType: 'CHECKOUT_ATTEMPT',
      timestamp: new Date().toISOString(),
      userId: cart.userId,
      address: address,
      totalPriceCents: cart.totalPriceCents,
      currency: cart.currency
    };

    await publish('checkout-events', checkoutAttemptEvent).catch(err =>
      console.error('[checkout] Failed to publish CHECKOUT_ATTEMPT:', err)
    );

    console.log(`[checkout] Published CHECKOUT_ATTEMPT for cart ${cart.cartId}`);

    const paymentSuccess = 1;

    if (paymentSuccess) {
      // Publish CHECKOUT_SUCCESS event
      const checkoutSuccessEvent = {
        eventId: crypto.randomUUID(),
        eventType: 'CHECKOUT_SUCCESS',
        timestamp: new Date().toISOString(),
        userId: cart.userId,
        orderId: crypto.randomUUID(),
        totalPriceCents: cart.totalPriceCents,
        currency: cart.currency,
        address: address
      };

      await publish('checkout-events', checkoutSuccessEvent).catch(err =>
        console.error('[checkout] Failed to publish CHECKOUT_SUCCESS:', err)
      );

      console.log(`[checkout] Published CHECKOUT_SUCCESS for cart ${cart.cartId}`);

      // Clear cart from database
      if (pgdb && pgdb.pool) {
        await pgdb.query('DELETE FROM CartItem WHERE cartId = $1', [cartId]);
        await pgdb.query('DELETE FROM Cart WHERE userId = $1', [userId]);
        console.log(`[checkout] Cleared cart ${cartId} from database`);
      }

      return res.json({
        success: true,
        message: 'Order confirmed',
        orderId: checkoutSuccessEvent.orderId
      });

    } else {
      // Publish CHECKOUT_FAILED event
      const checkoutFailedEvent = {
        eventId: crypto.randomUUID(),
        eventType: 'CHECKOUT_FAILED',
        timestamp: new Date().toISOString(),
        cartId: cart.cartId,
        userId: cart.userId,
        reason: 'Payment gateway error',
        totalPriceCents: cart.totalPriceCents,
        currency: cart.currency
      };

      await publish('checkout-events', checkoutFailedEvent).catch(err =>
        console.error('[checkout] Failed to publish CHECKOUT_FAILED:', err)
      );

      console.log(`[checkout] Published CHECKOUT_FAILED for cart ${cart.cartId}`);

      return res.status(402).json({
        success: false,
        error: 'Payment failed',
        actionable: 'Please try again or use a different payment method'
      });
    }

  } catch (err) {
    console.error('Error in checkout:', err);

    // Publish CHECKOUT_FAILED event for unexpected errors
    try {
      const checkoutFailedEvent = {
        eventId: crypto.randomUUID(),
        eventType: 'CHECKOUT_FAILED',
        timestamp: new Date().toISOString(),
        cartId: cartId,
        reason: 'Internal server error',
        error: err.message
      };

      await publish('checkout-events', checkoutFailedEvent).catch(e =>
        console.error('[checkout] Failed to publish CHECKOUT_FAILED:', e)
      );
    } catch (publishErr) {
      console.error('[checkout] Failed to publish error event:', publishErr);
    }

    return res.status(500).json({ error: 'Checkout failed' });
  }
});

module.exports = router;
