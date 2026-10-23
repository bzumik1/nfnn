package cz.novanadeje.app.donors.interfaces.rest;

import com.fasterxml.jackson.annotation.JsonProperty;

record TokenErrorResponse(String error, @JsonProperty("error_description") String errorDescription) {
}
