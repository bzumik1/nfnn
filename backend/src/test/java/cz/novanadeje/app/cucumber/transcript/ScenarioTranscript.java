package cz.novanadeje.app.cucumber.transcript;

import jakarta.mail.internet.MimeMessage;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.JsonNodeFactory;

import java.util.List;
import java.util.Map;

public final class ScenarioTranscript {

    public void exchange(RecordedExchange exchange) {
    }

    public void mails(List<MimeMessage> sent) {
    }

    public void logs(List<RecordedLogLine> lines) {
    }

    public JsonNode toJson(Map<String, String> knownValues) {
        return JsonNodeFactory.instance.objectNode();
    }
}
