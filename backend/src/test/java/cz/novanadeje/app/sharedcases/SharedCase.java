package cz.novanadeje.app.sharedcases;

import tools.jackson.databind.JsonNode;

public record SharedCase(String name, JsonNode input, JsonNode expected) {
}
