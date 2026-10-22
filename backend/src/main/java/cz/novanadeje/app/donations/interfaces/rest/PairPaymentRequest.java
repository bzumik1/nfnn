package cz.novanadeje.app.donations.interfaces.rest;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

record PairPaymentRequest(@NotNull UUID donorId) {
}
