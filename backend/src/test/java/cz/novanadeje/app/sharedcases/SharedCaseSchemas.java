package cz.novanadeje.app.sharedcases;

import com.networknt.schema.Schema;
import com.networknt.schema.SchemaLocation;
import com.networknt.schema.SchemaRegistry;
import com.networknt.schema.SchemaRegistryConfig;
import com.networknt.schema.SpecificationVersion;
import com.networknt.schema.path.PathType;
import tools.jackson.databind.JsonNode;

import java.nio.file.Files;
import java.util.List;

public final class SharedCaseSchemas {

    public static final String ID_PREFIX = "https://nfnn.cz/shared-cases/";

    private final SchemaRegistry registry = SchemaRegistry.withDefaultDialect(SpecificationVersion.DRAFT_2020_12,
            builder -> builder.schemas(SharedCaseSchemas::localSchema)
                    .schemaRegistryConfig(SchemaRegistryConfig.builder().pathType(PathType.JSON_POINTER).build()));

    public List<String> violations(String caseFile, JsonNode content) {
        Schema schema = registry.getSchema(SchemaLocation.of(ID_PREFIX + SharedCases.schemaOf(caseFile)));
        return schema.validate(content).stream().map(error -> error.getInstanceLocation() + " " + error.getMessage()).toList();
    }

    private static String localSchema(String iri) {
        if (!iri.startsWith(ID_PREFIX + SharedCases.SCHEMAS + "/")) {
            return null;
        }
        String path = iri.substring(ID_PREFIX.length());
        return Files.isRegularFile(SharedCases.root().resolve(path)) ? SharedCases.text(path) : null;
    }
}
