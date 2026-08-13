ALTER TABLE "Inventory"
ADD CONSTRAINT "inventory_stock_non_negative"
CHECK ("stock" >= 0);

ALTER TABLE "Inventory"
ADD CONSTRAINT "inventory_reserved_non_negative"
CHECK ("reserved" >= 0);

ALTER TABLE "Inventory"
ADD CONSTRAINT "inventory_reserved_not_exceed_stock"
CHECK ("reserved" <= "stock");

ALTER TABLE "Checkout"
ADD CONSTRAINT "checkout_quantity_positive"
CHECK ("quantity" > 0);

ALTER TABLE "Reservation"
ADD CONSTRAINT "reservation_quantity_positive"
CHECK ("quantity" > 0);

ALTER TABLE "Location"
ADD CONSTRAINT "location_priority_positive"
CHECK ("priority" > 0);