# Location-Based Inventory Reservation Service

A backend service for **location-aware inventory reservation and checkout**, built with NestJS, PostgreSQL, Prisma, and TypeScript.

The project focuses on backend engineering problems that appear when multiple customers compete for limited inventory:

* preventing concurrent over-reservation
* making checkout creation safe to retry
* keeping inventory and checkout state transactionally consistent
* selecting an appropriate fulfillment location
* handling payment success, failure, abandonment, and expiry
* testing concurrency at the API/database level

This project was designed to demonstrate **backend engineering and database consistency patterns**, not just CRUD implementation.

---

## Engineering Highlights

| Area                      | Implementation                                                   |
| ------------------------- | ---------------------------------------------------------------- |
| Concurrency control       | PostgreSQL row-level locking with `SELECT ... FOR UPDATE`        |
| Transactions              | Prisma interactive transactions around reservation/state changes |
| Idempotency               | Unique idempotency key + SHA-256 payload hash                    |
| Idempotency race handling | Handles PostgreSQL unique constraint conflicts                   |
| Inventory consistency     | `available = stock - reserved`                                   |
| Location selection        | Pincode → city → state → global fallback                         |
| Fulfillment               | Entire checkout is reserved from one location                    |
| Reservation lifecycle     | Reserved → Successful / Failed / Abandoned → Expired             |
| Testing                   | Unit tests + E2E tests + concurrent reservation test             |
| Containerization          | Docker + Docker Compose                                          |
| Data layer                | PostgreSQL + Prisma                                              |

---

# Architecture

```text
                         Client
                           |
                           v
                +----------------------+
                |   NestJS Controllers |
                +----------+-----------+
                           |
                           v
                +----------------------+
                |   DTO Validation     |
                +----------+-----------+
                           |
                           v
                +----------------------+
                | Checkout Service     |
                | Inventory Service    |
                | Location Service     |
                +----------+-----------+
                           |
                           v
                +----------------------+
                |       Prisma         |
                +----------+-----------+
                           |
                           v
                +----------------------+
                |     PostgreSQL       |
                +----------------------+
```

The checkout flow is the core of the system because it coordinates inventory, reservation, location selection, idempotency, and checkout state transitions.

---

# The Core Engineering Problems

## 1. Preventing Inventory Overselling

A simple check such as:

```ts
available >= requestedQuantity
```

is not sufficient when two requests execute concurrently.

For example:

```text
Available inventory = 7

Request A → wants 7
Request B → wants 7
```

Without concurrency control, both requests could observe the same available quantity before either reservation is committed.

### Solution

The reservation decision is made inside a PostgreSQL transaction.

The inventory row is explicitly locked:

```sql
SELECT
  "id",
  "stock",
  "reserved"
FROM "Inventory"
WHERE "productId" = ?
  AND "locationId" = ?
FOR UPDATE
```

The availability check happens **after acquiring the row lock**:

```text
Begin transaction
      |
      v
Lock inventory row
      |
      v
Calculate available
      |
      +---- insufficient ----> rollback
      |
      v
Increment reserved
      |
      v
Create checkout
      |
      v
Create reservation
      |
      v
Commit
```

Because competing transactions cannot modify the locked inventory row until the transaction completes, the reservation decision is made against the current database state.

### Why this matters

The important part is not simply using a transaction.

The important part is:

> **The availability check and inventory update are protected by the same database-level concurrency boundary.**

---

## 2. Idempotent Checkout Creation

Checkout requests can be retried because of network failures, client retries, or uncertain responses.

A retry should not create another reservation.

The API therefore requires an:

```text
Idempotency-Key
```

The system stores:

* the idempotency key
* a SHA-256 hash of the request payload

### Same key + same payload

```text
Request 1
   |
   +--> Create checkout
   +--> Reserve inventory
   +--> Return checkout

Request 2
   |
   +--> Same idempotency key
   +--> Same payload
   +--> Return existing checkout
```

No second reservation is created.

### Same key + different payload

The request is rejected:

```text
Idempotency-Key: abc123

Request A → quantity = 2
Request B → quantity = 5

             ↓

          Conflict
```

### Handling the race

The initial lookup is a fast path, but it is not treated as the only protection.

Two requests with the same idempotency key can both pass the initial lookup before either transaction commits.

The database therefore enforces uniqueness on `idempotencyKey`.

If a concurrent request loses that race, the service handles the PostgreSQL/Prisma unique constraint error and retrieves the existing checkout.

This gives the system both:

* an application-level fast path
* a database-level uniqueness guarantee

---

## 3. Transactional Inventory and Checkout State

Inventory and checkout state must not diverge.

For example, a successful payment requires both:

```text
stock     -= quantity
reserved  -= quantity
reservation → CONSUMED
checkout   → SUCCESSFUL
```

These changes are executed in one database transaction.

If the transaction fails, the database rolls the changes back instead of leaving partial state.

The same principle is used for payment failure and reservation expiry.

---

# Checkout Lifecycle

```text
                         +-------------+
                         |   RESERVED  |
                         +------+------+
                                |
              +-----------------+----------------+
              |                 |                |
           success           failure         abandon
              |                 |                |
              v                 v                v
       +-------------+   +-------------+   +-------------+
       | SUCCESSFUL  |   |   FAILED    |   |  ABANDONED  |
       +------+------+   +-------------+   +------+------+
              |                                |
       consume stock                    keep reservation
                                               |
                                               v
                                      retry window expires
                                               |
                                               v
                                        +-------------+
                                        |   EXPIRED   |
                                        +------+------+
                                               |
                                               v
                                      release reservation
```

### Payment success

Reserved inventory becomes sold inventory:

```text
stock    -= quantity
reserved -= quantity
reservation = CONSUMED
checkout   = SUCCESSFUL
```

### Payment failure

The reservation is released immediately:

```text
reserved -= quantity
reservation = RELEASED
checkout   = FAILED
```

### Abandoned checkout

The reservation is intentionally kept temporarily so the customer can retry payment.

The current implementation uses a **15-minute payment retry window**.

### Expiry

Expired reservations are released transactionally.

The expiry operation first conditionally changes the checkout from `RESERVED` to `EXPIRED`. If another operation has already changed the checkout state, the expiry operation does not continue releasing inventory.

This prevents the same checkout from being processed twice.

---

# Location-Aware Fulfillment

A checkout is fulfilled from **one location** rather than splitting a single checkout across multiple warehouses.

Candidate locations are ranked using the following tiers:

```text
Tier 0 → Active location serving delivery pincode
Tier 1 → Active location in the same city
Tier 2 → Active location in the same state
Tier 3 → Any active location
```

Within the same tier, the lower location priority value wins.

The important distinction is that location ranking is only a **candidate ordering**.

The actual inventory decision happens later, after the inventory row is locked.

That means a preferred location that becomes unavailable under concurrency can be skipped and the next candidate can be attempted.

---

# Inventory Model

The system maintains two inventory values:

```text
stock
reserved
```

Available inventory is derived as:

```text
available = stock - reserved
```

Example:

```text
stock    = 10
reserved = 7

available = 10 - 7 = 3
```

A successful payment consumes stock:

```text
Before:
stock = 10
reserved = 7
available = 3

After successful payment for 7:
stock = 3
reserved = 0
available = 3
```

This keeps physical stock and temporary reservations represented separately.

---

# Data Model

```text
Product
   |
   +---- Inventory ---- Location
   |                       |
   |                       +---- ServiceZone
   |
   +---- Checkout -------- Reservation
```

Main entities:

### Product

Represents the product being sold.

### Location

Represents a fulfillment/warehouse location and contains:

* city
* state
* priority
* active status

### ServiceZone

Maps a location to delivery pincodes.

### Inventory

Maintains product stock per location:

```text
(productId, locationId) → unique
```

### Checkout

Stores:

* requested quantity
* selected location
* delivery information
* idempotency key
* payload hash
* checkout status
* expiration time

### Reservation

Tracks the inventory reservation associated with a checkout.

Reservation states:

```text
ACTIVE
RELEASED
CONSUMED
```

---

# Database Constraints and Indexing

The PostgreSQL schema uses database constraints to protect important invariants.

Examples:

```text
Inventory
(productId, locationId) → UNIQUE

Checkout
idempotencyKey → UNIQUE

ServiceZone
(locationId, pincode) → UNIQUE

Reservation
checkoutId → UNIQUE
```

Indexes are also defined for commonly queried fields such as:

* product
* location
* location city/state
* active locations
* checkout status
* checkout expiration

This allows the database to enforce important uniqueness rules instead of relying only on application code.

---

# Testing Strategy

The project includes:

* unit tests for checkout service behavior
* E2E API tests
* a dedicated concurrency E2E test

The concurrency test is particularly important.

It creates:

```text
stock = 10
reserved = 0
```

Then sends two simultaneous checkout requests:

```text
Request A → quantity 7
Request B → quantity 7
```

Both requests use **different idempotency keys**, ensuring the test is actually testing concurrency rather than idempotency.

Expected result:

```text
Request A → 201
Request B → 422

reserved = 7
stock    = 10
available = 3
```

This verifies that the system does not oversell inventory under concurrent requests.

---

# API

## Checkout

```http
POST /checkouts
POST /checkouts/:checkoutId/payment
POST /checkouts/:checkoutId/abandon
POST /checkouts/:checkoutId/expire
```

### Create checkout

```http
POST /checkouts
Idempotency-Key: checkout-123
Content-Type: application/json
```

```json
{
  "productId": "PRODUCT_UUID",
  "quantity": 2,
  "deliveryPincode": "560001",
  "deliveryCity": "Bengaluru",
  "deliveryState": "Karnataka"
}
```

The checkout service:

1. validates the request
2. checks idempotency
3. finds candidate locations
4. attempts locations in priority order
5. locks the selected inventory row
6. verifies available inventory
7. reserves stock
8. creates the checkout
9. creates the reservation

These operations are coordinated so the reservation cannot be created independently of the checkout.

---

## Inventory

```http
POST /inventory
GET /inventory/product/:productId
GET /inventory/location/:locationId/inventory
GET /inventory/:locationId/availability
```

---

## Product and Location

Product and location creation are exposed through their respective controllers.

Locations can also be associated with delivery pincodes through service zones.

---

# Project Structure

```text
.
├── prisma/
│   ├── migrations/
│   └── schema.prisma
│
├── src/
│   ├── checkout/
│   │   ├── dto/
│   │   ├── checkout.controller.ts
│   │   ├── checkout.service.ts
│   │   └── checkout.scheduler.ts
│   │
│   ├── inventory/
│   ├── location/
│   ├── product/
│   ├── database/
│   └── ...
│
├── test/
│   ├── app.e2e-spec.ts
│   └── checkout-concurrency.e2e-spec.ts
│
├── Dockerfile
├── docker-compose.yml
├── prisma.config.ts
├── package.json
└── README.md
```

---

# Tech Stack

* **Node.js**
* **TypeScript**
* **NestJS 11**
* **Prisma 7**
* **PostgreSQL 17**
* **Jest**
* **Supertest**
* **pnpm**
* **Docker / Docker Compose**

---

# Local Development

## Prerequisites

* Node.js 22+
* pnpm 10+
* PostgreSQL 17+

Or:

* Docker
* Docker Compose

## Environment Variables

Create a `.env` file:

```env
POSTGRES_USER=inventory
POSTGRES_PASSWORD=inventory
POSTGRES_DB=inventory

DATABASE_URL="postgresql://inventory:inventory@localhost:5433/inventory?schema=public"

DOCKER_DATABASE_URL="postgresql://inventory:inventory@postgres:5432/inventory?schema=public"
```

The Docker mapping is:

```text
localhost:5433 → PostgreSQL container:5432
```

The host uses `localhost:5433`, while containers communicate with PostgreSQL through `postgres:5432`.

Keep `.env` out of version control.

---

## Install

```bash
pnpm install
```

Generate Prisma Client:

```bash
pnpm prisma generate
```

Apply existing migrations:

```bash
pnpm prisma migrate deploy
```

For development migrations:

```bash
pnpm prisma migrate dev
```

Start the API:

```bash
pnpm start:dev
```

API:

```text
http://localhost:3000
```

---

# Docker

Build:

```bash
docker compose build
```

Start:

```bash
docker compose up
```

Detached:

```bash
docker compose up -d
```

Check services:

```bash
docker compose ps
```

The PostgreSQL service includes a health check, and the API depends on PostgreSQL becoming healthy before starting.

Stop:

```bash
docker compose down
```

Remove the database volume:

```bash
docker compose down -v
```

> `docker compose down -v` removes the PostgreSQL data stored in the Compose volume.

---

# Testing

Run the full Jest suite:

```bash
pnpm exec jest --runInBand
```

Run checkout service tests:

```bash
pnpm exec jest src/checkout/checkout.service.spec.ts --runInBand
```

Run E2E tests:

```bash
pnpm test:e2e
```

Run with coverage:

```bash
pnpm test:cov
```

Important scenarios include:

* checkout reservation
* successful payment
* failed payment
* abandoned checkout
* reservation expiry
* pincode-based location selection
* location fallback
* idempotent retries
* idempotency-key payload mismatch
* concurrent checkout attempts
* insufficient inventory
* transaction failure propagation

---

# Design Decisions and Trade-offs

## Reserve before payment

Inventory is reserved when checkout starts.

**Reason:** payment should not succeed for stock that has already been claimed by another checkout.

**Trade-off:** abandoned checkouts temporarily hold inventory, so the system needs an expiry mechanism.

## Single-location fulfillment

A checkout is fulfilled from one location.

**Reason:** this keeps reservation and inventory accounting simpler and avoids splitting a checkout across warehouses.

**Trade-off:** an order may be rejected even when its quantity could theoretically be fulfilled by combining stock from multiple locations.

## Database-level concurrency protection

Availability is checked after acquiring a PostgreSQL row lock.

**Reason:** an application-level availability check alone can race under concurrent requests.

**Trade-off:** row locking introduces transaction contention for highly contested inventory rows.

## Idempotency

Checkout creation requires an idempotency key.

**Reason:** clients can safely retry requests without accidentally creating duplicate reservations.

**Trade-off:** the server must persist idempotency metadata and validate payload consistency.

---

# What This Project Demonstrates

This project is intentionally focused on backend engineering fundamentals that matter beyond CRUD APIs:

* designing transactional workflows
* reasoning about race conditions
* using PostgreSQL locking correctly
* protecting invariants at the database layer
* designing idempotent APIs
* modeling state machines
* handling failure and retry paths
* designing relational schemas and constraints
* writing API-level concurrency tests
* containerizing a service and database

The most important part of the project is not the number of endpoints.

It is the reasoning required to keep **inventory, reservations, checkout state, retries, and concurrent requests consistent**.

---



