-- CreateEnum
CREATE TYPE "CheckoutStatus" AS ENUM ('RESERVED', 'SUCCESSFUL', 'FAILED', 'ABANDONED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('ACTIVE', 'RELEASED', 'CONSUMED');

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceZone" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,

    CONSTRAINT "ServiceZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Checkout" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "locationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "deliveryPincode" TEXT NOT NULL,
    "deliveryCity" TEXT NOT NULL,
    "deliveryState" TEXT NOT NULL,
    "status" "CheckoutStatus" NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checkout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "checkoutId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE INDEX "Location_city_idx" ON "Location"("city");

-- CreateIndex
CREATE INDEX "Location_state_idx" ON "Location"("state");

-- CreateIndex
CREATE INDEX "Location_active_idx" ON "Location"("active");

-- CreateIndex
CREATE INDEX "ServiceZone_pincode_idx" ON "ServiceZone"("pincode");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceZone_locationId_pincode_key" ON "ServiceZone"("locationId", "pincode");

-- CreateIndex
CREATE INDEX "Inventory_productId_idx" ON "Inventory"("productId");

-- CreateIndex
CREATE INDEX "Inventory_locationId_idx" ON "Inventory"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Inventory_productId_locationId_key" ON "Inventory"("productId", "locationId");

-- CreateIndex
CREATE UNIQUE INDEX "Checkout_idempotencyKey_key" ON "Checkout"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Checkout_productId_idx" ON "Checkout"("productId");

-- CreateIndex
CREATE INDEX "Checkout_locationId_idx" ON "Checkout"("locationId");

-- CreateIndex
CREATE INDEX "Checkout_status_idx" ON "Checkout"("status");

-- CreateIndex
CREATE INDEX "Checkout_expiresAt_idx" ON "Checkout"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_checkoutId_key" ON "Reservation"("checkoutId");

-- AddForeignKey
ALTER TABLE "ServiceZone" ADD CONSTRAINT "ServiceZone_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inventory" ADD CONSTRAINT "Inventory_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checkout" ADD CONSTRAINT "Checkout_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_checkoutId_fkey" FOREIGN KEY ("checkoutId") REFERENCES "Checkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
