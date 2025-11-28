# Module Federation (MFE) Proof of Concept

## What is this?

This repository is a proof of concept (PoC) to explore a micro-frontend (MFE) architecture. The goal is to provide a hands-on, runnable example that we can use as a starting point for discussion.

We've all felt the friction in our current frontend, and this is an experiment to see if this approach could work for us.

This PoC uses **Module Federation** to combine three separate **React 18** applications (with MUI for UI) into a single, cohesive webpage.

## What it contains

- **`mips_host`:** The main "shell" application. It's responsible for the overall page layout, the navigation bar, and loading the other micro-frontends (remotes).
- **`mips_product_page`:** A remote application. It shows a list of products and lets you add them to the cart.
- **`mips_shopping_cart`:** A remote application. It shows the items in the cart (added from the product page) and lets you remove them.

## How to Run

There are two ways to run this, depending on your needs.

### Option 1: Local Development (Recommended)

This method provides hot-reloading, which is much easier for development. You'll just need to open three separate terminals.

```bash
# Terminal 1: Start the shopping cart
cd MIPS-Frontend/mips_shopping_cart
npm run dev

# Terminal 2: Start the product page
cd MIPS-Frontend/mips_product_page
npm run dev

# Terminal 3: Start the host
cd MIPS-Frontend/mips_host
npm run dev
```

You can also run `npx tsc --noEmit` in any project folder to check for TypeScript errors.

### Option 2: Docker Compose

This is a good way to test the production-like build in a clean environment.

```sh
# Build and run all services
docker compose up --build

# Stop and clean up
docker compose down -v
```

### Accessing the Apps

Once running, you can access all the independent applications:

- **Host Shell (The main app):** `http://localhost:3000`
- **Remote (Products):** `http://localhost:3001`
- **Remote (Cart):** `http://localhost:3002`

---

## Key Features Demonstrated

This PoC was built to test a few specific, high-priority features:

### 1\. Resiliency (Safe Failing)

The host loads all remotes inside a React Error Boundary (see `SafeComponent.tsx`). This means if the shopping cart remote crashes, it will **not** take down the entire application. The rest of the site, including the product page, will continue to function.

### 2\. Consistent UI & Theming

The PoC proves we can have a single, consistent UI library. By sharing `react` and `@mui/material` as "singletons," only one instance is loaded. The remotes use the _exact_ same React Context as the host. This is why when you (eventually) toggle dark mode in the host, the remote components will update instantly without any extra code.

### 3\. Global State Management

This PoC also shows how we can share state between remotes using the "Callback (via Host)" pattern.

- The **host** owns the cart state (`cartItems`).
- It passes the `cartItems` and a `onRemoveFromCart` callback to the **shopping cart** remote.
- It passes an `onAddToCart` callback to the **product page** remote.

When you click "Add" on the product page, it calls the host's function. The host updates its own state, which then causes the shopping cart remote to re-render with the new item. This keeps the host as the single source of truth and our remotes simple.

---

## A Proposed Starting Point (for discussion)

For this architecture to be efficient, we'd probably need to agree on a few standards. Here are the ones used in this PoC, which I'm proposing as our starting point:

1.  **A Single Framework: React 18**
    All remotes should expose React 18 components. While Module Federation _can_ load other frameworks, it would force the user to download multiple framework bundles (e.g., both React and Svelte), which defeats the purpose.

    - **Note:** This means teams on Next.js would need to export their work as plain React 18 components, not a full Next.js app (since we can't use its router or server-side functions).

2.  **A Single UI Library: MUI**
    To keep our look and feel consistent, we should all build from the same set of components.

3.  **Use the Theme, Not Hard-coded Styles**
    This is key. Components should get styles from the shared theme (e.g., `palette.primary.main`) instead of hard-coding values (e.g., `color: '#FFF'`). This is how we'll share brand colors, font sizes, and spacing.

---

## Known Trade-offs & Concerns

This architecture isn't free. The biggest trade-off is a new, critical dependency:

**All teams _must_ use the exact same versions of shared libraries.**

Because `react` and `@mui/material` are shared as singletons, the host and all remotes must have the _exact same version_ in their `package.json`. If the host loads `react@18.2.0` and a remote requires `react@18.1.0`, the app will throw a runtime error. This forces us to coordinate on core dependency updates.

## Next Steps

This PoC is just a starting point. If we like this direction, our next steps could be:

- [ ] Refactor the MUI theme into its own shared, versioned package.
- [ ] Figure out a good pattern for shared types.
- [ ] Add authentication.
