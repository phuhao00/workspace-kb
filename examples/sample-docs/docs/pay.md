# Payment guide

## Overview

Orders go through the payment service. Failures usually mean callback or signature errors.

## Payment failure

When a payment fails, check the order status, idempotency lock, and provider callback logs.
