package cz.novanadeje.app.cucumber.transcript;

import io.cucumber.spring.ScenarioScope;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

@Component
@ScenarioScope
public class ApiTranscriptRecorder {

    private final ScenarioTranscript transcript = new ScenarioTranscript();
    private final List<AuditedExchange> audited = new ArrayList<>();

    public void exchange(RecordedExchange exchange) {
        if (ApiTranscripts.recording()) {
            transcript.exchange(exchange);
        }
    }

    public void audited(AuditedExchange exchange) {
        audited.add(exchange);
    }

    public List<AuditedExchange> auditedExchanges() {
        return List.copyOf(audited);
    }

    ScenarioTranscript transcript() {
        return transcript;
    }
}
