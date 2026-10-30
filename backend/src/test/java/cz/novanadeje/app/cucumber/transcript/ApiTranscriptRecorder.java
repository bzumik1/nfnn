package cz.novanadeje.app.cucumber.transcript;

import io.cucumber.spring.ScenarioScope;
import org.springframework.stereotype.Component;

@Component
@ScenarioScope
public class ApiTranscriptRecorder {

    private final ScenarioTranscript transcript = new ScenarioTranscript();

    public void exchange(RecordedExchange exchange) {
        if (ApiTranscripts.recording()) {
            transcript.exchange(exchange);
        }
    }

    ScenarioTranscript transcript() {
        return transcript;
    }
}
