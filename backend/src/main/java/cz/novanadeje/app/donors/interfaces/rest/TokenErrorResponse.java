package cz.novanadeje.app.donors.interfaces.rest;

import com.fasterxml.jackson.annotation.JsonProperty;

record TokenErrorResponse(String error, @JsonProperty("error_description") String errorDescription) {

    static final TokenErrorResponse INVALID_GRANT =
            new TokenErrorResponse("invalid_grant", "The grant is invalid, expired, already used or issued to another client.");
    static final TokenErrorResponse INVALID_CLIENT = new TokenErrorResponse("invalid_client", "The client is not known or does not match.");
    static final TokenErrorResponse INVALID_TARGET = new TokenErrorResponse("invalid_target", "Tokens are not issued for the requested resource.");
    static final TokenErrorResponse INVALID_REQUEST =
            new TokenErrorResponse("invalid_request", "The request lacks a parameter or carries one that is not valid.");
    static final TokenErrorResponse UNSUPPORTED_GRANT_TYPE = new TokenErrorResponse("unsupported_grant_type", "grant_type is not supported");
}
