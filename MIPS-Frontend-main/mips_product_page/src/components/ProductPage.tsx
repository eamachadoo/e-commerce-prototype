import React, { useState, useEffect } from "react"; // <--- FIXED: Imported Hooks
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress"; // <--- FIXED: Imported Spinner

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  description?: string;
  image?: string;
}

interface ProductPageProps {
  onAddToCart: (product: Product) => void;
}

const ProductPage = ({ onAddToCart = () => {} }: ProductPageProps) => {
  // State to hold real data
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch Data on Mount
  useEffect(() => {
    fetch("http://localhost:4000/api/items")
      .then((response) => {
        if (!response.ok) {
          throw new Error("Failed to fetch products");
        }
        return response.json();
      })
      .then((data) => {
        setProducts(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error loading products:", err);
        setError("Failed to load products. Is the backend running?");
        setLoading(false);
      });
  }, []);

  // Loading State
  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  // Error State
  if (error) {
    return (
      <Box sx={{ p: 3, color: "error.main" }}>
        <Typography variant="h6">Error: {error}</Typography>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        p: "1.5rem",
        border: "2px dashed",
        borderColor: "primary.main",
        borderRadius: "8px",
        bgcolor: "background.paper",
        color: "text.primary",
        maxWidth: "1200px", 
        my: "1rem",
        textAlign: "left",
      }}
    >
      <Typography
        variant="h4"
        component="h2"
        sx={{
          color: "primary.main",
          mt: 0,
          fontWeight: "bold",
        }}
      >
        📦 Product Page (Loaded from Remote)
      </Typography>

      <Typography variant="body1" sx={{ mb: 2, color: "text.secondary" }}>
        This component fetches real data from your backend at localhost:4000.
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))",
          gap: "1.5rem",
        }}
      >
        
        {products.map((product) => (
          <Card
            key={product.id}
            sx={{
              bgcolor: "background.default",
              color: "inherit",
              display: "flex",
              flexDirection: "column",
            }}
          >
             
             {product.image && (
              <Box 
                component="img" 
                src={product.image} 
                alt={product.name}
                sx={{ height: 180, objectFit: "contain", p: 2, bgcolor: "white" }} 
              />
            )}
            
            <CardContent sx={{ flexGrow: 1 }}>
              <Typography
                variant="h6"
                component="h4"
                sx={{ marginTop: 0, fontWeight: "bold" }}
              >
                {product.name}
              </Typography>

              <Typography variant="body1" sx={{ mb: 1, fontWeight: "bold", color: "primary.main" }}>
                ${(product.price / 100).toFixed(2)}
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2 }}>
                 Stock: {product.stock}
              </Typography>

              <Button
                variant="contained"
                color="primary"
                fullWidth
                onClick={() => onAddToCart(product)}
                disabled={product.stock === 0}
                sx={{ fontWeight: "bold" }}
              >
                {product.stock === 0 ? "Out of Stock" : "Add to Cart"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
};

export default ProductPage;