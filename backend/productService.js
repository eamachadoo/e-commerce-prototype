const fetch = require('node-fetch');

function parseItem(item) {
    const p = item && item.product ? item.product : item;
    const priceFloat = parseFloat(p && p.price) || 0;
    const priceCents = Math.round(priceFloat * 100);
    const images = (p && p.images) || [];
    const categories = (p && p.categories) || [];

    return {
        id: p && (p.id || p.id === 0) ? p.id : null,
        name: p && (p.name || p.title) ? (p.name || p.title) : 'Unnamed',
        price: priceCents,
        stock: p && p.stock_unlimited ? 999 : (p && typeof p.stock !== 'undefined' ? p.stock : 0),
        description: p && p.description ? p.description : null,
        image: images.length > 0 ? (images[0].url || images[0]) : null,
        sku: p && p.sku ? p.sku : null,
        category: categories.length > 0 ? (categories[0].name || categories[0]) : null
    };
}

async function getProductsFromUrl(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'Authorization': `Basic ${Buffer.from(`${this.login}:${this.authToken}`).toString('base64')}`
            }
        });

        if (!response.ok) {
            const text = await response.text().catch(() => '');
            throw new Error(`API Error: ${response.status} ${text}`);
        }

        const data = await response.json();

        // Jumpseller may return an array of product objects, or wrappers like { product: { ... } }.
        // Be resilient to both shapes.
        return (data || []).map(parseItem).filter(r => r && r.id != null);
    } catch (error) {
        console.error('Error fetching products from Jumpseller:', error && error.message ? error.message : error);
        return null; // Fall back to local database
    }
}

class ProductService {
    constructor() {
        this.apiUrl = process.env.JUMPSELLER_API_URL || 'https://api.jumpseller.com/v1';
        this.login = process.env.JUMPSELLER_LOGIN;
        this.authToken = process.env.JUMPSELLER_AUTH_TOKEN;
    }
    
    async getProducts() {
        return await getProductsFromUrl(`${this.apiUrl}/products.json`);
    }

    async getProduct(id) {
        let res = await getProductsFromUrl(`${this.apiUrl}/products/${id}.json`);
        if (!res || res.length != 1) return null;
        return res[0];
    }
}

module.exports = new ProductService();
