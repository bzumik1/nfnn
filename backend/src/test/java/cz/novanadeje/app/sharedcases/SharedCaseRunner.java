package cz.novanadeje.app.sharedcases;

import cz.novanadeje.app.support.CanonicalJson;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;
import tools.jackson.databind.JsonNode;

import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

public abstract class SharedCaseRunner {

    protected abstract String caseFile();

    protected abstract String when();

    protected abstract String then();

    protected abstract void run(SharedCase sharedCase) throws Exception;

    public static void assertGives(JsonNode actual, JsonNode expected) {
        assertThat(CanonicalJson.write(actual)).as("the whole value, every field and none more").isEqualTo(CanonicalJson.write(expected));
    }

    @TestFactory
    @DisplayName("Given every case of a shared case file, when the backend computes it, then it gives the case's expected value")
    public Stream<DynamicTest> should_give_the_expected_value_when_the_backend_computes_every_case_of_a_shared_case_file() {
        SharedCaseFile file = SharedCases.read(caseFile());
        assertThat(file.cases()).as("cases in %s", caseFile()).isNotEmpty();
        return file.cases().stream().map(sharedCase -> DynamicTest.dynamicTest("Given " + sharedCase.name() + ", " + when() + ", " + then(),
                SharedCases.root().resolve(caseFile()).toUri(), () -> run(sharedCase)));
    }
}
