ALTER TABLE "Checkout"
ADD COLUMN IF NOT EXISTS "unitPricePaise" INTEGER;

UPDATE "Checkout" AS c
SET "unitPricePaise" = p."pricePaise"
FROM "Product" AS p
WHERE c."productId" = p."id"
  AND c."unitPricePaise" IS NULL;

ALTER TABLE "Checkout"
ALTER COLUMN "unitPricePaise" SET NOT NULL;