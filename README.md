# Location-Based Inventory Reservation Service

A NestJS backend that models checkout inventory for a commerce application with multiple warehouse locations.

The service reserves inventory **before payment**, keeps inventory consistent across successful, failed, and abandoned payments, selects an appropriate warehouse based on delivery location, supports idempotent checkout retries, and protects inventory from concurrent over-reservation.

## Tech Stack

- Node.js
- TypeScript
- NestJS
- Prisma 7
- PostgreSQL
- Jest
- pnpm
- Docker / Docker Compose

## Core Features

- Create products and warehouse locations.
- Add inventory for a product at a location.
- Start checkout and reserve stock before payment.
- Fulfill a checkout from a single suitable location.
- Prefer locations serving the delivery pincode.
- Use lower priority number when multiple suitable locations qualify.
- Fall back to active locations in the same city, then state, then any active location.
- Process successful payment and convert reserved stock into sold stock.
- Process failed payment and release the reservation immediately.
- Mark a checkout as abandoned/user-dropped while keeping its reservation during the retry window.
- Expire abandoned checkouts and release their reservations.
- Support idempotent checkout creation.
- Reject reuse of an idempotency key with a different payload.
- Protect reservations from concurrent over-reservation using database transactions/locking.
- Query product availability and location-level inventory.

## Inventory Model

Available inventory is:

```text
available = stock - reserved
```

Checkout lifecycle:

```text
                     +--------------+
                     |   RESERVED   |
                     +------+-------+
                            |
              +-------------+-------------+
              |             |             |
           success        failure      abandoned
              |             |             |
              v             v             v
        SUCCESSFUL       FAILED       ABANDONED
              |             |             |
        consume stock   release      keep reservation
                                      |
                                 retry window
                                      |
                                      v
                                   EXPIRED
                                      |
                                  release
```

A failed payment releases stock immediately. An abandoned payment keeps the stock reserved temporarily so the user can retry payment. Expiry releases the abandoned reservation.

## Location Selection

Checkout attempts to reserve the complete quantity from **one location**.

Selection preference:

1. Active location serving the delivery pincode and capable of fulfilling the order.
2. If multiple matching locations qualify, lower priority number wins.
3. If no service-zone location can fulfill the order, use an active location in the same city.
4. Then use an active location in the same state.
5. Finally, use any active location that can fulfill the order.

## Idempotency

Checkout creation accepts an idempotency key.

For the same key and the same request payload:

```text
request 1 -> creates checkout + reservation
request 2 -> returns existing checkout
```

No second reservation is created.

If the same key is reused with a different payload, the request is rejected.

## Concurrency

Reservation is performed inside a database transaction with database-level protection so concurrent checkouts cannot reserve more stock than is available.

For example, if only 7 units are available and two concurrent requests each attempt to reserve 7 units, only one reservation succeeds and inventory remains consistent.

## Project Structure

```text
.
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── checkout/
│   ├── inventory/
│   ├── product/
│   ├── location/
│   ├── prisma/
│   └── ...
├── test/
│   ├── app.e2e-spec.ts
│   └── checkout-concurrency.e2e-spec.ts
├── Dockerfile
├── docker-compose.yml
├── prisma.config.ts
├── package.json
├── pnpm-lock.yaml
└── README.md
```

## Prerequisites

Local development:

- Node.js 22+
- pnpm 10+
- PostgreSQL 17+

Docker setup:

- Docker
- Docker Compose

## Environment Variables

Create `.env` in the project root.

Example:

```env
POSTGRES_USER=inventory
POSTGRES_PASSWORD=inventory
POSTGRES_DB=inventory

# Host/local development
DATABASE_URL="postgresql://inventory:inventory@localhost:5433/inventory?schema=public"

# API container
DOCKER_DATABASE_URL="postgresql://inventory:inventory@postgres:5432/inventory?schema=public"
```

### Port note

The Docker mapping is:

```text
localhost:5433 -> PostgreSQL container:5432
```

So host applications use `localhost:5433`, while the API container uses `postgres:5432`.

Keep `.env` out of version control.

## Local Setup

Install dependencies:

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

Start development server:

```bash
pnpm start:dev
```

The API runs on:

```text
http://localhost:3000
```

## Docker Setup

Build:

```bash
docker compose build
```

Start:

```bash
docker compose up
```

Or detached:

```bash
docker compose up -d
```

Check containers:

```bash
docker compose ps
```

The PostgreSQL service has a health check and the API waits for PostgreSQL to become healthy.

The API container runs Prisma migrations before starting NestJS.

Stop:

```bash
docker compose down
```

Remove containers and database volume:

```bash
docker compose down -v
```

> `docker compose down -v` deletes the PostgreSQL data stored in the Compose volume.

## Testing

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
pnpm exec jest test --runInBand
```

Important scenarios covered by the test suite include:

- Checkout reserves stock.
- Successful payment consumes stock.
- Failed payment releases stock.
- Abandoned payment keeps stock reserved.
- Expired abandoned payment releases stock.
- Pincode/service-zone location selection.
- Location fallback.
- Idempotent checkout retry.
- Same idempotency key with changed payload is rejected.
- Concurrent checkouts cannot oversell.

## API Overview

### Checkout

```http
POST /checkouts
POST /checkouts/:checkoutId/payment
POST /checkouts/:checkoutId/abandon
POST /checkouts/:checkoutId/expire
```

### Inventory

```http
POST /inventory
GET /inventory/product/:productId
GET /inventory/location/:locationId/inventory
GET /inventory/:locationId/availability
```

Product and location creation are exposed through their respective controllers.

## Example Checkout Flow

```text
1. Create product
       |
2. Create location(s)
       |
3. Add inventory
       |
4. POST /checkouts
       |
5. Inventory becomes reserved
       |
6. Payment outcome
       |
       +-- success   -> stock consumed
       |
       +-- failure   -> reservation released
       |
       +-- abandoned
               |
          reservation retained
               |
          retry window expires
               |
          reservation released
```

## Design Decisions

### Reserve before payment

Inventory is reserved when checkout starts rather than after payment succeeds. This prevents multiple users from successfully reaching payment for the same limited stock.

### Single-location fulfillment

A checkout is fulfilled from one warehouse. This keeps the reservation model simple and avoids splitting a single order across multiple locations.

### Transactional consistency

Checkout and inventory state changes are performed transactionally so partial state changes are avoided when an operation fails.

### Idempotency

Network retries are expected in distributed systems. An idempotency key prevents retries from creating duplicate checkout reservations.

### Database-level concurrency protection

An application-level check such as `available >= quantity` is not sufficient under concurrency. The reservation decision is protected by the database transaction/locking strategy.

## Troubleshooting

### Prisma says `DATABASE_URL` is missing

Check the environment for the context in which the command runs.

Host:

```text
localhost:5433
```

Docker:

```text
postgres:5432
```

Check Compose configuration:

```bash
docker compose config
```

Check the API container:

```bash
docker compose exec api sh -c 'echo "$DATABASE_URL"'
```

### PostgreSQL port conflict

If host port `5433` is occupied, change only the host side of:

```yaml
ports:
  - "5433:5432"
```

The PostgreSQL container continues to listen on `5432`.

### Rebuild after Docker configuration changes

```bash
docker compose build --no-cache api
docker compose up
```

## Submission Checklist

- [ ] Source code committed.
- [ ] Tests passing.
- [ ] Concurrency test passing.
- [ ] README included.
- [ ] `.env` excluded from Git.
- [ ] Docker image builds successfully.
- [ ] Docker Compose starts PostgreSQL and API.
- [ ] Prisma migrations run successfully.
- [ ] API endpoints verified.
- [ ] Repository pushed to GitHub.
- [ ] API deployed to Render or another free hosting platform.

## Bonus: Frontend Playground

A lightweight frontend playground can be added to exercise the API manually.

It can provide:

- Product/location creation.
- Inventory setup.
- Checkout creation.
- Payment success/failure/abandon actions.
- Checkout expiration.
- Product availability.
- Location-level inventory.