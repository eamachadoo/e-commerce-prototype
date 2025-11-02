const fetch = require('node-fetch');

class ProductService {
    constructor() {
        this.apiUrl = process.env.JUMPSELLER_API_URL || 'https://api.jumpseller.com/v1';
        this.login = process.env.JUMPSELLER_LOGIN;
        this.authToken = process.env.JUMPSELLER_AUTH_TOKEN;
        this.useLocalDb = process.env.USE_LOCAL_DB === 'true';
    }

    async getProducts() {
        if (this.useLocalDb) {
            // Return null to indicate we should use local database
            return null;
        }

        try {
            const response = await fetch(`${this.apiUrl}/products.json`, {
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${this.login}:${this.authToken}`).toString('base64')}`
                }
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }

            const data = await response.json();
            
            // Transform Jumpseller product format to our format
            return data.map(item => ({
                id: item.product.id,
                name: item.product.name,
                price: Math.round(item.product.price * 100), // Convert EUR to cents
                stock: item.product.stock_unlimited ? 999 : item.product.stock,
                description: item.product.description,
                image: item.product.images.length > 0 ? item.product.images[0].url : null,
                sku: item.product.sku,
                category: item.product.categories.length > 0 ? item.product.categories[0].name : null
            }));
        } catch (error) {
            console.error('Error fetching products from Jumpseller:', error);
            return null; // Fall back to local database
        }
    }
}

module.exports = new ProductService();
