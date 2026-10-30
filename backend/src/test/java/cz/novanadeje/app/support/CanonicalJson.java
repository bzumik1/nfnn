package cz.novanadeje.app.support;

import tools.jackson.core.util.DefaultIndenter;
import tools.jackson.core.util.DefaultPrettyPrinter;
import tools.jackson.core.util.Separators;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectWriter;
import tools.jackson.databind.json.JsonMapper;

public final class CanonicalJson {

    private static final DefaultIndenter TWO_SPACES = new DefaultIndenter("  ", "\n");
    private static final ObjectWriter WRITER = JsonMapper.builder().build().writerWithDefaultPrettyPrinter().with(new DefaultPrettyPrinter()
            .withSeparators(Separators.createDefaultInstance()
                    .withObjectNameValueSpacing(Separators.Spacing.AFTER)
                    .withObjectEmptySeparator("")
                    .withArrayEmptySeparator(""))
            .withObjectIndenter(TWO_SPACES)
            .withArrayIndenter(TWO_SPACES));

    private CanonicalJson() {
    }

    public static String write(JsonNode node) {
        return WRITER.writeValueAsString(node) + "\n";
    }
}
