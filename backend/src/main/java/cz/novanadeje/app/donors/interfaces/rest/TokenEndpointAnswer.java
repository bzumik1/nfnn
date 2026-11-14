package cz.novanadeje.app.donors.interfaces.rest;

sealed interface TokenEndpointAnswer permits TokenResponse, TokenErrorResponse {
}
