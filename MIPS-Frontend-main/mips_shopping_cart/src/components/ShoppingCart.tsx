import React, { useMemo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import Divider from "@mui/material/Divider";
import IconButton from "@mui/material/IconButton";
import DeleteIcon from "@mui/icons-material/Delete"; 

export interface Product {
  id: string;
  name: string;
  price: number;
}

export interface CartItem {
  instanceId: string;
  product: Product;
}

interface ShoppingCartPageProps {
  items: CartItem[];
  onRemoveFromCart: (instanceId: string) => void;
}

const ShoppingCartPage = ({
  items = [],
  onRemoveFromCart = () => {},
}: ShoppingCartPageProps) => {
  
  const groupedItems = useMemo(() => {
    const groups = new Map<string, CartItem[]>();
    
    items.forEach((item) => {
      const productId = item.product.id;
      if (!groups.has(productId)) {
        groups.set(productId, []);
      }
      groups.get(productId)?.push(item);
    });

    return Array.from(groups.values());
  }, [items]);

  // Calculate total price
  const totalPrice = items.reduce((sum, item) => sum + item.product.price, 0);

  return (
    <Box
      sx={{
        p: "1.5rem",
        border: "2px dashed",
        borderColor: "error.main",
        borderRadius: "8px",
        bgcolor: "background.paper",
        maxWidth: "800px",
        my: "1rem",
        textAlign: "left",
      }}
    >
      <Typography
        variant="h4"
        component="h2"
        sx={{
          color: "error.main",
          mt: 0,
          fontWeight: "bold",
        }}
      >
        🛒 Shopping Cart
      </Typography>

      <Box>
        {items.length === 0 ? (
          <Typography variant="body1" sx={{ mt: 2 }}>Your cart is empty.</Typography>
        ) : (
          <List sx={{ padding: 0 }}>
            {groupedItems.map((group) => {
              
              const representative = group[0];
              const quantity = group.length;
              const product = representative.product;
              const lineTotal = product.price * quantity;

              return (
                <ListItem
                  key={product.id}
                  sx={{
                    p: "1rem",
                    bgcolor: "background.default",
                    borderRadius: "5px",
                    mb: "1rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center"
                  }}
                >
                  
                  <Box>
                    <Typography variant="h6" component="h4" sx={{ fontWeight: "bold" }}>
                      {product.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      ${(product.price / 100).toFixed(2)} each
                    </Typography>
                  </Box>

                
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Box 
                        sx={{ 
                            bgcolor: "primary.main", 
                            color: "primary.contrastText", 
                            px: 2, 
                            py: 0.5, 
                            borderRadius: 4,
                            fontWeight: "bold"
                        }}
                    >
                        Qty: {quantity}
                    </Box>
                  </Box>

                 
                  <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: "bold", minWidth: "80px", textAlign: "right" }}>
                       ${(lineTotal / 100).toFixed(2)}
                    </Typography>

                    <Button
                      variant="outlined"
                      color="error"
                      onClick={() => {
                         // Remove just ONE item from this group (the last one added)
                         const itemToRemove = group[group.length - 1];
                         onRemoveFromCart(itemToRemove.instanceId);
                      }}
                    >
                      Remove 
                    </Button>
                  </Box>
                </ListItem>
              );
            })}
          </List>
        )}
      </Box>

      {items.length > 0 && (
        <>
          <Divider sx={{ my: 2 }} />
          <Typography
            variant="h5"
            component="h3"
            sx={{ textAlign: "right", fontWeight: "bold" }}
          >
            Total: ${(totalPrice / 100).toFixed(2)}
          </Typography>
        </>
      )}
    </Box>
  );
};

export default ShoppingCartPage;