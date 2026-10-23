package cz.novanadeje.app.donors.interfaces.rest;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

record AuthorizationServerMetadata(
        String issuer,
        @JsonProperty("authorization_endpoint") String authorizationEndpoint,
        @JsonProperty("token_endpoint") String tokenEndpoint,
        @JsonProperty("scopes_supported") List<String> scopesSupported,
        @JsonProperty("response_types_supported") List<String> responseTypesSupported,
        @JsonProperty("grant_types_supported") List<String> grantTypesSupported,
        @JsonProperty("token_endpoint_auth_methods_supported") List<String> tokenEndpointAuthMethodsSupported,
        @JsonProperty("code_challenge_methods_supported") List<String> codeChallengeMethodsSupported,
        @JsonProperty("client_id_metadata_document_supported") boolean clientIdMetadataDocumentSupported,
        @JsonProperty("authorization_response_iss_parameter_supported") boolean authorizationResponseIssParameterSupported) {
}
