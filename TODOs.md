# TODOs
backend:
  - [x] change routes of cart.js for the ones we need (and verify they work)
  - [ ] remove items table from database (we should only save cart_items and they have the item_id for an item in jumpseller)
frontend:
  - [x] remove host and product page
  - [x] change shopping cart page to be "self-suficient" (have all the logic needed inside (or in backend) only requiring an user_id to create the react object)
  - [x] connect frontend with the backend
docker:
  - [x] remove all unnecessary containers (only need: backend, frontend, db)
terraform:
  - [ ] change terraform to only publish the images that docker creates
gateway:
  - [ ] add our routes for other people to use (api.madeinportugal.store/...)

lastly, integrate our micro-frontend with the main frontend in the MIPS-Frontend-... repo

CHANGE EVERY REFERENCE OF localhost TO THE FINAL URLs (example: https://frontend-service-838526384849.europe-west2.run.app/...)
