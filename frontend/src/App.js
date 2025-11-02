import React, { useState, useEffect } from 'react';
import './App.css';

const API_BASE = 'http://localhost:4000/api';

function App() {
  const [currentView, setCurrentView] = useState('products');
  const [items, setItems] = useState([]);
  const [cart, setCart] = useState({ items: [], subtotal: 0, shipping: 0, discount: 0, total: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [address, setAddress] = useState({ line1: '', city: '', zip: '' });

  // Fetch products on component mount
  useEffect(() => {
    fetchItems();
    fetchCart();
  }, []);

  const fetchItems = async () => {
    try {
      const response = await fetch(`${API_BASE}/items`);
      const data = await response.json();
      setItems(data);
    } catch (err) {
      setError('Failed to load products');
    }
  };

  const fetchCart = async () => {
    try {
      const response = await fetch(`${API_BASE}/cart`);
      const data = await response.json();
      setCart(data);
    } catch (err) {
      console.error('Failed to load cart:', err);
    }
  };

  const addToCart = async (itemId, quantity = 1) => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity })
      });
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.actionable || data.error);
        return;
      }
      
      await fetchCart();
      setError('Item added to cart!');
      setTimeout(() => setError(''), 2000);
    } catch (err) {
      setError('Failed to add item to cart');
    } finally {
      setLoading(false);
    }
  };

  const updateCartItem = async (itemId, quantity) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE}/cart/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity })
      });
      const data = await response.json();
      
      if (!response.ok) {
        setError(data.actionable || data.error);
        return;
      }
      
      await fetchCart();
    } catch (err) {
      setError('Failed to update cart');
    }
  };

  const removeFromCart = async (itemId) => {
    setError('');
    try {
      const response = await fetch(`${API_BASE}/cart/${itemId}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        setError('Failed to remove item');
        return;
      }
      
      await fetchCart();
    } catch (err) {
      setError('Failed to remove item');
    }
  };

  const handleCheckout = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address })
      });
      const data = await response.json();
      
      if (!response.ok) {
        if (data.details) {
          setError(`Stock issues: ${data.details.map(d => d.actionable).join(', ')}`);
        } else {
          setError(data.actionable || data.error);
        }
        return;
      }
      
      setError('Order confirmed! Thank you for your purchase.');
      setShowCheckoutModal(false);
      setCurrentView('products');
      setAddress({ line1: '', city: '', zip: '' });
      await fetchCart();
      await fetchItems(); // Refresh to show updated stock
    } catch (err) {
      setError('Checkout failed');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (cents) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div className="App">
      <header className="app-header">
        <h1>E-Commerce Store</h1>
        <nav>
          <button 
            className={currentView === 'products' ? 'active' : ''} 
            onClick={() => setCurrentView('products')}
          >
            Products
          </button>
          <button 
            className={currentView === 'cart' ? 'active' : ''} 
            onClick={() => setCurrentView('cart')}
          >
            Cart ({cart.items.length})
          </button>
        </nav>
      </header>

      {error && <div className={`error-message ${error.includes('added') || error.includes('confirmed') ? 'success' : ''}`}>{error}</div>}

      {currentView === 'products' && (
        <div className="products-view">
          <h2>Our Products</h2>
          <div className="products-grid">
            {items.map(item => (
              <div key={item.id} className="product-card">
                {item.image && (
                  <div className="product-image">
                    <img src={item.image} alt={item.name} />
                  </div>
                )}
                <div className="product-info">
                  <h3>{item.name}</h3>
                  {item.category && (
                    <span className="category-badge">{item.category}</span>
                  )}
                  <p className="price">{formatPrice(item.price)}</p>
                  <p className="stock">Stock: {item.stock === 999 ? 'In Stock' : item.stock}</p>
                  {item.description && (
                    <div className="product-description">
                      <p>{item.description.replace(/<[^>]*>/g, '').substring(0, 120)}...</p>
                    </div>
                  )}
                  <button 
                    onClick={() => addToCart(item.id)} 
                    disabled={loading || item.stock === 0}
                    className="add-to-cart-btn"
                  >
                    {item.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentView === 'cart' && (
        <div className="cart-view">
          <h2>Shopping Cart</h2>
          {cart.items.length === 0 ? (
            <p>Your cart is empty. <button onClick={() => setCurrentView('products')}>Continue Shopping</button></p>
          ) : (
            <>
              <div className="cart-items">
                {cart.items.map(item => (
                  <div key={item.id} className="cart-item">
                    <div className="item-info">
                      <h3>{item.name}</h3>
                      <p>{formatPrice(item.unitPrice)} each</p>
                    </div>
                    <div className="quantity-controls">
                      <button onClick={() => updateCartItem(item.id, item.quantity - 1)}>-</button>
                      <span>{item.quantity}</span>
                      <button onClick={() => updateCartItem(item.id, item.quantity + 1)}>+</button>
                    </div>
                    <div className="line-total">
                      {formatPrice(item.lineTotal)}
                    </div>
                    <button 
                      onClick={() => removeFromCart(item.id)}
                      className="remove-btn"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="cart-summary">
                <div className="summary-line">
                  <span>Subtotal:</span>
                  <span>{formatPrice(cart.subtotal)}</span>
                </div>
                <div className="summary-line">
                  <span>Shipping:</span>
                  <span>{formatPrice(cart.shipping)}</span>
                </div>
                {cart.discount > 0 && (
                  <div className="summary-line discount">
                    <span>Discount:</span>
                    <span>-{formatPrice(cart.discount)}</span>
                  </div>
                )}
                <div className="summary-line total">
                  <span>Total:</span>
                  <span>{formatPrice(cart.total)}</span>
                </div>
                <button 
                  onClick={() => setShowCheckoutModal(true)}
                  className="checkout-btn"
                  disabled={loading}
                >
                  Checkout
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {showCheckoutModal && (
        <div className="modal-overlay">
          <div className="modal">
            <h3>Confirm Your Order</h3>
            <div className="address-form">
              <input
                type="text"
                placeholder="Address Line 1"
                value={address.line1}
                onChange={(e) => setAddress({...address, line1: e.target.value})}
              />
              <input
                type="text"
                placeholder="City"
                value={address.city}
                onChange={(e) => setAddress({...address, city: e.target.value})}
              />
              <input
                type="text"
                placeholder="ZIP Code"
                value={address.zip}
                onChange={(e) => setAddress({...address, zip: e.target.value})}
              />
            </div>
            <div className="order-summary">
              <p><strong>Total: {formatPrice(cart.total)}</strong></p>
              <p>Items: {cart.items.length}</p>
            </div>
            <div className="modal-buttons">
              <button onClick={() => setShowCheckoutModal(false)}>Cancel</button>
              <button 
                onClick={handleCheckout}
                disabled={loading || !address.line1}
                className="confirm-btn"
              >
                {loading ? 'Processing...' : 'Confirm Purchase'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;