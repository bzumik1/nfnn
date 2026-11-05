package cz.novanadeje.app.cucumber;

import io.cucumber.java.en.Then;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

public class ConcurrentWritesStepDefinitions {

    private final ConcurrentWrites writes;
    private final JsonMapper json = JsonMapper.builder().build();

    public ConcurrentWritesStepDefinitions(ConcurrentWrites writes) {
        this.writes = writes;
    }

    @Then("write {int} answers {int}")
    public void writeAnswers(int position, int status) {
        assertThat(writes.answer(position).getStatusCode().value()).withFailMessage("Write %d answered %s", position, writes.answer(position).getBody())
                .isEqualTo(status);
    }

    @Then("write {int} is refused as {string}")
    public void writeIsRefusedAs(int position, String problem) {
        writeAnswers(position, 409);
        assertThat(json.readTree(writes.answer(position).getBody()).get("type").asString()).isEqualTo("https://nfnn.cz/problems/" + problem);
    }

    @Then("write {int} is refused as {string} with the version now stored and the current record")
    public void writeIsRefusedAsWithTheVersionNowStored(int position, String problem) {
        writeAnswers(position, 409);
        JsonNode body = json.readTree(writes.answer(position).getBody());
        assertThat(body.get("type").asString()).isEqualTo("https://nfnn.cz/problems/" + problem);
        String now = writes.write(position).versionNow().get();
        assertThat(now).isNotEqualTo(writes.write(position).versionRead());
        assertThat(body.get("version").asString()).isEqualTo(now);
        assertThat(body.get("current").isObject()).isTrue();
    }
}
